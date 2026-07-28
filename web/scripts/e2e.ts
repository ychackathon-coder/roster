/**
 * End-to-end verification of the whole product against a RUNNING server.
 *
 *   npm run build && npm run start   # terminal 1 (or npm run dev)
 *   npm run e2e                      # terminal 2
 *
 * Covers: signup (seeded directly in auth.users — the project has email
 * confirmation ON and default-SMTP rate limits, so e2e cannot burn real
 * signups), session cookies, org creation + invite join, org isolation, repo
 * indexing, HQ decisions, task queueing, runner token minting, and — the real
 * thing — a live Claude Code session executing a task in a scratch git repo
 * with its actions streamed back as events.
 *
 * The agent step needs the `claude` CLI installed and signed in. Skip it with
 * E2E_SKIP_AGENT=1 (everything else still runs).
 */
import { spawn, execSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";
import { createClient, type Session } from "@supabase/supabase-js";

const BASE = (process.env.E2E_BASE ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const RUNNER_ENTRY = path.resolve(process.cwd(), "..", "runner", "src", "index.ts");
const SCRATCH = "/tmp/roster-e2e-repo";
const AGENT_TIMEOUT_MS = 6 * 60_000;

let pass = 0;
let fail = 0;
const bad: string[] = [];
const ok = (label: string) => { pass++; console.log(`  \x1b[32m✔\x1b[0m ${label}`); };
const no = (label: string, detail?: string) => {
  fail++; bad.push(label);
  console.log(`  \x1b[31m✖\x1b[0m ${label}${detail ? `\n     ${detail.slice(0, 300)}` : ""}`);
};
const hr = (s: string) => console.log(`\n\x1b[1m${s}\x1b[0m`);
const assert = (cond: unknown, label: string, detail?: string) => (cond ? ok(label) : no(label, detail));

/* ------------------------------ auth plumbing ------------------------------ */

function projectRef(): string {
  return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split(".")[0]!;
}

/** The cookie @supabase/ssr reads: sb-<ref>-auth-token = base64-<b64url(session)>. */
function sessionCookie(session: Session): string {
  const value = `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`;
  return `sb-${projectRef()}-auth-token=${value}`;
}

async function seedUser(c: pg.Client, email: string, password: string): Promise<string> {
  const { rows } = await c.query(
    `with new_user as (
       insert into auth.users
         (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
          raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
          confirmation_token, recovery_token, email_change, email_change_token_new)
       values
         ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
          $1, extensions.crypt($2, extensions.gen_salt('bf')), now(),
          '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '')
       returning id, email
     )
     insert into auth.identities (id, user_id, provider_id, identity_data, provider, created_at, updated_at, last_sign_in_at)
     select gen_random_uuid(), id, id::text,
            jsonb_build_object('sub', id::text, 'email', email, 'email_verified', true),
            'email', now(), now(), now()
     from new_user returning user_id`,
    [email, password],
  );
  return rows[0].user_id;
}

async function signIn(email: string, password: string): Promise<Session> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error(`sign-in failed: ${error?.message}`);
  return data.session;
}

function api(cookie: string) {
  return async (method: string, pathName: string, body?: unknown) => {
    const res = await fetch(`${BASE}${pathName}`, {
      method,
      headers: { Cookie: cookie, ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(180_000),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { status: res.status, json };
  };
}

/* ---------------------------------- main ----------------------------------- */

async function main() {
  const stamp = Date.now();
  const password = "roster-e2e-Passw0rd!";
  const owner = `ansh.roster.e2e+o${stamp}@gmail.com`;
  const member = `ansh.roster.e2e+m${stamp}@gmail.com`;
  const outsider = `ansh.roster.e2e+x${stamp}@gmail.com`;

  hr("0. server up");
  try {
    const res = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(8000) });
    const j = await res.json();
    assert(res.ok && j.ok, `server + db healthy at ${BASE}`);
  } catch (err) {
    no("server unreachable", String(err));
    return finish();
  }

  const c = new pg.Client({
    connectionString: process.env.DATABASE_URL_POOLER,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  hr("1. auth — seeded users can sign in and reach the API");
  await seedUser(c, owner, password);
  await seedUser(c, member, password);
  await seedUser(c, outsider, password);
  const ownerApi = api(sessionCookie(await signIn(owner, password)));
  const memberApi = api(sessionCookie(await signIn(member, password)));
  const outsiderApi = api(sessionCookie(await signIn(outsider, password)));

  const me = await ownerApi("GET", "/api/orgs");
  assert(me.status === 200 && me.json.org === null, "session cookie accepted; no org yet");
  const anon = await fetch(`${BASE}/api/state`);
  assert(anon.status === 401, "unauthenticated /api/state is rejected (401)");

  hr("2. company creation + invite join");
  const created = await ownerApi("POST", "/api/orgs", { name: "E2E Industries", display_name: "Ansh" });
  const org = created.json.org as { id: string; invite_code: string } | undefined;
  assert(created.status === 200 && org?.invite_code?.startsWith("RSTR-"), `org created (${org?.invite_code})`, JSON.stringify(created.json));

  const dup = await ownerApi("POST", "/api/orgs", { name: "Second Co" });
  assert(dup.status === 409, "second org for same user is refused (409)");

  const badJoin = await memberApi("POST", "/api/orgs/join", { code: "RSTR-XXXX-XXXX", display_name: "Maya" });
  assert(badJoin.status === 404, "bad invite code is refused (404)");
  const goodJoin = await memberApi("POST", "/api/orgs/join", { code: org!.invite_code, display_name: "Maya" });
  assert(goodJoin.status === 200, "member joins with invite code");

  hr("3. onboarding — index a real GitHub repo");
  const indexed = await ownerApi("POST", "/api/index-repo", { repo: "chalk/chalk" });
  const profile = indexed.json.profile as { source_repo?: string; traits?: string[] } | undefined;
  assert(indexed.status === 200 && profile?.source_repo === "chalk/chalk", "profile derived from chalk/chalk", JSON.stringify(indexed.json).slice(0, 300));
  assert((profile?.traits?.length ?? 0) >= 2, `profile has ${profile?.traits?.length} traits`);

  hr("4. HQ decisions");
  const routed = await ownerApi("POST", "/api/hq", {
    request: "Create a CONTRIBUTING.md that explains how to propose changes to this project",
    team: "Engineering",
  });
  const task = routed.json.task as { id: string; status: string } | null;
  assert(
    routed.status === 200 && ["route_existing", "spawn_new"].includes(String(routed.json.decision)),
    `agent decision made: ${routed.json.decision} -> ${routed.json.sub_agent}`,
  );
  assert(Boolean(task?.id) && task?.status === "queued", "real task queued for the agent");
  assert(
    typeof routed.json.terminal_line === "string" && (routed.json.terminal_line as string).includes("chalk"),
    "terminal line cites the calibration repo",
    String(routed.json.terminal_line),
  );

  const direct = await ownerApi("POST", "/api/hq", { request: "status", team: "Sales" });
  assert(direct.json.decision === "handle_direct" && direct.json.task === null, "trivial request handled direct, no task");

  const memory = await ownerApi("POST", "/api/hq", {
    request: "Could someone create a CONTRIBUTING.md about proposing changes?",
    team: "Engineering",
  });
  const meta = memory.json.meta as { memory_match?: { id?: string } | null } | undefined;
  assert(Boolean(meta?.memory_match), "memory recalls the similar prior request");

  hr("5. org isolation");
  await outsiderApi("POST", "/api/orgs", { name: "Other Co", display_name: "Rival" });
  const outsiderState = await outsiderApi("GET", "/api/state");
  const oEvents = (outsiderState.json.events as unknown[]) ?? [];
  const oTasks = (outsiderState.json.tasks as unknown[]) ?? [];
  assert(oEvents.length === 0 && oTasks.length === 0, "a different company sees NONE of it");

  const memberState = await memberApi("GET", "/api/state");
  assert(((memberState.json.events as unknown[]) ?? []).length >= 2, "a teammate sees the shared stream");

  hr("6. runner token");
  const minted = await ownerApi("POST", "/api/runners", { name: "e2e-runner" });
  const token = minted.json.token as string | undefined;
  assert(minted.status === 200 && token?.startsWith("rt_"), "runner token minted");
  const badRunner = await fetch(`${BASE}/api/runner/next-task`, { headers: { Authorization: "Bearer rt_wrong" } });
  assert(badRunner.status === 401, "bad runner token rejected (401)");

  if (process.env.E2E_SKIP_AGENT === "1") {
    hr("7. REAL agent session — SKIPPED (E2E_SKIP_AGENT=1)");
    await c.end();
    return finish();
  }

  hr("7. REAL agent session — a live Claude Code run in a scratch repo");
  rmSync(SCRATCH, { recursive: true, force: true });
  mkdirSync(SCRATCH, { recursive: true });
  writeFileSync(path.join(SCRATCH, "README.md"), "# e2e scratch project\n\nA tiny project used to verify Roster agents.\n");
  writeFileSync(path.join(SCRATCH, "index.js"), "console.log('hello');\n");
  execSync("git init -q && git add -A && git commit -qm init", { cwd: SCRATCH });
  ok(`scratch git repo at ${SCRATCH}`);

  // Strip this session's Claude Code env so the nested agent starts clean.
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (k.startsWith("CLAUDE")) delete env[k];

  const runner: ChildProcess = spawn(
    path.resolve(process.cwd(), "node_modules/.bin/tsx"),
    [RUNNER_ENTRY, "start", "--hub", BASE, "--token", token!, "--repo", SCRATCH, "--poll", "2", "--timeout", "5"],
    { stdio: ["ignore", "pipe", "pipe"], env },
  );
  let runnerLog = "";
  runner.stdout?.on("data", (d: Buffer) => { runnerLog += d.toString(); });
  runner.stderr?.on("data", (d: Buffer) => { runnerLog += d.toString(); });

  console.log("  \x1b[2mwaiting for the agent session (this is a real `claude` run, typically 1–4 min)…\x1b[0m");
  const deadline = Date.now() + AGENT_TIMEOUT_MS;
  let finalTask: { status?: string; activity_count?: number; result_summary?: string | null } | null = null;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 5000));
    const state = await ownerApi("GET", "/api/state");
    const tasks = (state.json.tasks as Array<{ id: string; status: string; activity_count: number; result_summary: string | null }>) ?? [];
    const t = tasks.find((x) => x.id === task!.id);
    if (t && (t.status === "done" || t.status === "failed")) { finalTask = t; break; }
  }
  runner.kill("SIGKILL");

  if (!finalTask) {
    no("agent session did not finish inside the timeout", runnerLog.slice(-400));
  } else {
    assert(finalTask.status === "done", `task finished: ${finalTask.status}`, finalTask.result_summary ?? runnerLog.slice(-400));
    assert((finalTask.activity_count ?? 0) > 0, `real actions streamed (${finalTask.activity_count})`);
    assert(existsSync(path.join(SCRATCH, "CONTRIBUTING.md")), "CONTRIBUTING.md actually exists in the repo");
    if (existsSync(path.join(SCRATCH, "CONTRIBUTING.md"))) {
      const body = readFileSync(path.join(SCRATCH, "CONTRIBUTING.md"), "utf8");
      assert(body.length > 100, `file has real content (${body.length} bytes)`);
    }
    const state = await ownerApi("GET", "/api/state");
    const terminal = (state.json.terminal as string[]) ?? [];
    assert(terminal.some((l) => l.includes("✓ completed") || l.includes("Build Agent")), "agent activity visible in the dashboard terminal feed");
    const runners = (state.json.runners as Array<{ status: string }>) ?? [];
    assert(runners.length >= 1, "runner visible to the dashboard");
  }

  await cleanup(c, [owner, member, outsider]);
  await c.end();
  finish();
}

/** Remove this run's users and orgs; org FKs cascade to all product data. */
async function cleanup(c: pg.Client, emails: string[]) {
  try {
    await c.query(
      `delete from public.orgs where created_by in (select id from auth.users where email = any($1))`,
      [emails],
    );
    await c.query(`delete from auth.users where email = any($1)`, [emails]);
    ok("e2e data cleaned up");
  } catch (err) {
    no("cleanup failed", (err as Error).message);
  }
}

function finish() {
  hr("RESULT");
  console.log(`  ${pass} passed, ${fail} failed`);
  if (bad.length) for (const b of bad) console.log(`    ✖ ${b}`);
  console.log("");
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
