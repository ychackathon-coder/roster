/**
 * Stuck-task recovery.
 *
 * A runner that claims a task and dies (laptop closed, process killed) would
 * otherwise leave the task claimed/running forever, showing a permanent
 * "Running" on the dashboard.
 *
 * Called two ways, deliberately:
 *   - /api/cron/sweep on a schedule (the loopugc team is on Hobby, which
 *     REJECTS sub-daily crons at deploy time — so vercel.json pins a daily
 *     backstop; tighten to every-5-minutes after a Pro upgrade), and
 *   - opportunistically from /api/state, so ANY open dashboard heals its own
 *     org even with no cron at all.
 *
 * Safety: runners heartbeat every ~20s WHILE executing (see runner + the
 * heartbeat route), so a 90s staleness window never requeues a task whose
 * runner is merely busy on a long Claude run. A hard ceiling fails tasks whose
 * heartbeat stopped advancing entirely.
 */
import { pool } from "./db";

const STALE_RUNNER = "90 seconds";
const HARD_CEILING = "30 minutes";

export type SweepResult = { requeued: number; failed: number };

export async function sweepStuckTasks(orgId?: string): Promise<SweepResult> {
  const client = await pool().connect();
  try {
    await client.query("begin");

    // Runner went silent -> give the task back to the queue for another runner.
    const { rows: requeued } = await client.query(
      `update tasks t
          set status = 'queued', runner_id = null, updated_at = now()
        where t.status in ('claimed', 'running')
          and ($1::uuid is null or t.org_id = $1)
          and t.runner_id is not null
          and exists (select 1 from runners r
                       where r.id = t.runner_id
                         and r.last_seen < now() - interval '${STALE_RUNNER}')
        returning t.id, t.org_id, t.team, t.request, t.sub_agent`,
      [orgId ?? null],
    );

    // Heartbeats stopped advancing for far too long -> the work is dead.
    const { rows: failed } = await client.query(
      `update tasks t
          set status = 'failed', updated_at = now(),
              result_summary = coalesce(result_summary, '') ||
                ' [failed by sweeper: no progress for ${HARD_CEILING}]'
        where t.status = 'running'
          and ($1::uuid is null or t.org_id = $1)
          and t.updated_at < now() - interval '${HARD_CEILING}'
        returning t.id, t.org_id, t.team, t.request, t.sub_agent`,
      [orgId ?? null],
    );

    for (const r of requeued) {
      await client.query(
        `insert into events (org_id, team, "user", request, decision, sub_agent, reasoning, terminal_line)
         values ($1,$2,$3,$4,'route_existing',$5,$6,$7)`,
        [r.org_id, r.team, "system", r.request, r.sub_agent,
         "The runner executing this task went offline; the task returned to the queue for the next available runner.",
         `[HQ] ⟲ requeued — runner went offline: ${String(r.request).slice(0, 120)}`],
      );
    }
    for (const r of failed) {
      await client.query(
        `insert into events (org_id, team, "user", request, decision, sub_agent, reasoning, terminal_line)
         values ($1,$2,$3,$4,'route_existing',$5,$6,$7)`,
        [r.org_id, r.team, "system", r.request, r.sub_agent,
         `No progress heartbeat for ${HARD_CEILING}; the session is presumed dead.`,
         `[HQ] ✗ timed out: ${String(r.request).slice(0, 140)}`],
      );
    }

    await client.query("commit");
    return { requeued: requeued.length, failed: failed.length };
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}
