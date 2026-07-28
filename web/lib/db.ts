/**
 * Server-side Postgres access.
 *
 * The API talks straight to Postgres via the Supabase pooler, as the owner role.
 * RLS is enabled on every table with no policies, so this connection is the ONLY
 * data path — browsers can't touch tables even with the anon key. Org scoping is
 * therefore enforced here, in queries, and every function below takes an org id
 * explicitly rather than trusting its caller's SQL.
 *
 * Uses the transaction pooler (port 6543): required for serverless, where many
 * short-lived instances would exhaust direct connections.
 */
import { Pool } from "pg";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import type {
  Decision,
  EventRow,
  Org,
  Runner,
  Task,
  TeamProfile,
} from "./contracts";

declare global {
  // eslint-disable-next-line no-var
  var __rosterPool: Pool | undefined;
}

/** One pool per process; survives Next dev hot-reload via globalThis. */
export function pool(): Pool {
  if (!globalThis.__rosterPool) {
    const url = process.env.DATABASE_URL_POOLER || process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL_POOLER is not set");
    globalThis.__rosterPool = new Pool({
      connectionString: url,
      ssl: { rejectUnauthorized: false },
      max: 3,
      idleTimeoutMillis: 30_000,
    });
  }
  return globalThis.__rosterPool;
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/* --------------------------------- orgs ----------------------------------- */

/** Unambiguous alphabet — no 0/O/1/I — because people read these aloud. */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export function generateInviteCode(): string {
  const bytes = randomBytes(8);
  let out = "";
  for (let i = 0; i < 8; i++) out += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length];
  return `RSTR-${out.slice(0, 4)}-${out.slice(4)}`;
}

export async function orgForUser(userId: string): Promise<(Org & { role: string; display_name: string }) | null> {
  const { rows } = await pool().query(
    `select o.*, m.role, m.display_name
       from org_members m join orgs o on o.id = m.org_id
      where m.user_id = $1 limit 1`,
    [userId],
  );
  return rows[0] ?? null;
}

export async function createOrg(a: {
  userId: string;
  name: string;
  displayName: string;
}): Promise<Org> {
  const client = await pool().connect();
  try {
    await client.query("begin");
    // Retry on the astronomically-unlikely invite-code collision rather than 500ing.
    let org: Org | null = null;
    for (let i = 0; i < 3 && !org; i++) {
      try {
        const { rows } = await client.query(
          `insert into orgs (name, invite_code, created_by) values ($1, $2, $3) returning *`,
          [a.name, generateInviteCode(), a.userId],
        );
        org = rows[0];
      } catch (err) {
        if (!/orgs_invite_code_key/.test(String(err))) throw err;
      }
    }
    if (!org) throw new Error("could not generate a unique invite code");
    await client.query(
      `insert into org_members (org_id, user_id, role, display_name) values ($1, $2, 'owner', $3)`,
      [org.id, a.userId, a.displayName],
    );
    await client.query("commit");
    return org;
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}

export async function joinOrg(a: {
  userId: string;
  code: string;
  displayName: string;
}): Promise<Org | null> {
  const { rows } = await pool().query(`select * from orgs where invite_code = $1`, [
    a.code.trim().toUpperCase(),
  ]);
  const org: Org | undefined = rows[0];
  if (!org) return null;
  await pool().query(
    `insert into org_members (org_id, user_id, role, display_name)
     values ($1, $2, 'member', $3)
     on conflict (user_id) do nothing`,
    [org.id, a.userId, a.displayName],
  );
  return org;
}

/* -------------------------------- profiles --------------------------------- */

export async function activeProfile(orgId: string): Promise<TeamProfile | null> {
  const { rows } = await pool().query(
    `select archetype, summary, traits, directive, source_repo
       from team_profiles where org_id = $1 and is_active limit 1`,
    [orgId],
  );
  if (!rows[0]) return null;
  const r = rows[0];
  return {
    archetype: r.archetype,
    summary: r.summary,
    traits: Array.isArray(r.traits) ? r.traits : [],
    directive: r.directive,
    source_repo: r.source_repo,
  };
}

export async function setActiveProfile(orgId: string, p: TeamProfile): Promise<void> {
  const client = await pool().connect();
  try {
    await client.query("begin");
    await client.query(`update team_profiles set is_active = false where org_id = $1 and is_active`, [orgId]);
    await client.query(
      `insert into team_profiles (org_id, archetype, summary, traits, directive, source_repo)
       values ($1, $2, $3, $4, $5, $6)`,
      [orgId, p.archetype, p.summary, JSON.stringify(p.traits), p.directive, p.source_repo],
    );
    await client.query("commit");
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}

/* --------------------------------- events ---------------------------------- */

export async function insertEvent(e: {
  orgId: string;
  team: string;
  user: string | null;
  request: string;
  decision: Decision;
  subAgent: string;
  reasoning: string;
  terminalLine: string;
}): Promise<EventRow> {
  const { rows } = await pool().query(
    `insert into events (org_id, team, "user", request, decision, sub_agent, reasoning, terminal_line)
     values ($1,$2,$3,$4,$5,$6,$7,$8) returning *`,
    [e.orgId, e.team, e.user, e.request, e.decision, e.subAgent, e.reasoning, e.terminalLine],
  );
  return rowToEvent(rows[0]);
}

export async function recentEvents(orgId: string, limit = 50): Promise<EventRow[]> {
  const { rows } = await pool().query(
    `select * from events where org_id = $1 order by at desc limit $2`,
    [orgId, limit],
  );
  return rows.map(rowToEvent);
}

function rowToEvent(r: Record<string, unknown>): EventRow {
  return {
    id: String(r.id),
    org_id: String(r.org_id),
    team: String(r.team ?? ""),
    user: (r.user as string | null) ?? null,
    request: String(r.request),
    decision: r.decision as Decision,
    sub_agent: String(r.sub_agent),
    reasoning: String(r.reasoning),
    terminal_line: String(r.terminal_line),
    at: new Date(r.at as string).toISOString(),
  };
}

/* ---------------------------------- tasks ----------------------------------- */

export async function createTask(t: {
  orgId: string;
  eventId: string | null;
  request: string;
  team: string;
  requestedBy: string | null;
  subAgent: string;
  prompt: string;
}): Promise<Task> {
  const { rows } = await pool().query(
    `insert into tasks (org_id, event_id, request, team, requested_by, sub_agent, prompt)
     values ($1,$2,$3,$4,$5,$6,$7) returning *`,
    [t.orgId, t.eventId, t.request, t.team, t.requestedBy, t.subAgent, t.prompt],
  );
  return rowToTask(rows[0]);
}

export async function orgTasks(orgId: string, limit = 30): Promise<Task[]> {
  const { rows } = await pool().query(
    `select * from tasks where org_id = $1 order by created_at desc limit $2`,
    [orgId, limit],
  );
  return rows.map(rowToTask);
}

/**
 * Atomically claim the oldest queued task for an org. The CTE + FOR UPDATE
 * SKIP LOCKED makes two runners polling simultaneously get different tasks,
 * never the same one.
 */
export async function claimNextTask(orgId: string, runnerId: string): Promise<Task | null> {
  const { rows } = await pool().query(
    `with next as (
       select id from tasks
        where org_id = $1 and status = 'queued'
        order by created_at
        for update skip locked
        limit 1
     )
     update tasks t set status = 'claimed', runner_id = $2, updated_at = now()
       from next where t.id = next.id
     returning t.*`,
    [orgId, runnerId],
  );
  return rows[0] ? rowToTask(rows[0]) : null;
}

export async function updateTask(a: {
  taskId: string;
  orgId: string;
  status?: Task["status"];
  resultSummary?: string;
  bumpActivity?: boolean;
}): Promise<void> {
  await pool().query(
    `update tasks set
       status = coalesce($3, status),
       result_summary = coalesce($4, result_summary),
       activity_count = activity_count + $5,
       updated_at = now()
     where id = $1 and org_id = $2`,
    [a.taskId, a.orgId, a.status ?? null, a.resultSummary ?? null, a.bumpActivity ? 1 : 0],
  );
}

export async function taskById(taskId: string, orgId: string): Promise<Task | null> {
  const { rows } = await pool().query(`select * from tasks where id = $1 and org_id = $2`, [
    taskId,
    orgId,
  ]);
  return rows[0] ? rowToTask(rows[0]) : null;
}

function rowToTask(r: Record<string, unknown>): Task {
  return {
    id: String(r.id),
    org_id: String(r.org_id),
    event_id: (r.event_id as string | null) ?? null,
    request: String(r.request),
    team: String(r.team ?? ""),
    requested_by: (r.requested_by as string | null) ?? null,
    sub_agent: String(r.sub_agent),
    prompt: String(r.prompt),
    status: r.status as Task["status"],
    runner_id: (r.runner_id as string | null) ?? null,
    result_summary: (r.result_summary as string | null) ?? null,
    activity_count: Number(r.activity_count ?? 0),
    created_at: new Date(r.created_at as string).toISOString(),
    updated_at: new Date(r.updated_at as string).toISOString(),
  };
}

/* --------------------------------- runners ---------------------------------- */

export async function createRunner(a: {
  orgId: string;
  name: string;
}): Promise<{ runner: Runner; token: string }> {
  // rt_ prefix makes the token recognizable in configs and impossible to
  // mistake for a Supabase key.
  const token = `rt_${randomUUID().replace(/-/g, "")}${randomBytes(8).toString("hex")}`;
  const { rows } = await pool().query(
    `insert into runners (org_id, name, token_hash) values ($1, $2, $3) returning *`,
    [a.orgId, a.name, sha256(token)],
  );
  return { runner: rowToRunner(rows[0]), token };
}

export async function runnerByToken(token: string): Promise<Runner | null> {
  if (!token.startsWith("rt_")) return null;
  const { rows } = await pool().query(`select * from runners where token_hash = $1`, [
    sha256(token),
  ]);
  return rows[0] ? rowToRunner(rows[0]) : null;
}

export async function touchRunner(runnerId: string, workspace?: string): Promise<void> {
  await pool().query(
    `update runners set last_seen = now(), workspace = coalesce($2, workspace) where id = $1`,
    [runnerId, workspace ?? null],
  );
}

export async function orgRunners(orgId: string): Promise<Runner[]> {
  const { rows } = await pool().query(
    `select * from runners where org_id = $1 order by created_at desc limit 20`,
    [orgId],
  );
  return rows.map(rowToRunner);
}

function rowToRunner(r: Record<string, unknown>): Runner {
  const lastSeen = new Date(r.last_seen as string);
  return {
    id: String(r.id),
    org_id: String(r.org_id),
    name: String(r.name),
    workspace: (r.workspace as string | null) ?? null,
    // "online" = heartbeat within 30s. Runners poll every ~5s, so this is 6
    // missed polls — offline means genuinely gone, not one slow request.
    status: Date.now() - lastSeen.getTime() < 30_000 ? "online" : "offline",
    last_seen: lastSeen.toISOString(),
  };
}
