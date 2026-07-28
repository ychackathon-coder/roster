import { NextResponse } from "next/server";
import { requireRunner } from "@/lib/auth";
import { pool } from "@/lib/db";

export const runtime = "nodejs";

/**
 * Liveness while executing. requireRunner already bumps runners.last_seen;
 * passing task_id also advances the task's updated_at so the sweeper's hard
 * ceiling only fires when progress has TRULY stopped.
 */
export async function POST(req: Request) {
  const auth = await requireRunner(req);
  if ("error" in auth) return auth.error;

  const body = (await req.json().catch(() => ({}))) as { task_id?: string };
  if (body.task_id) {
    await pool().query(
      `update tasks set updated_at = now()
        where id = $1 and runner_id = $2 and status in ('claimed','running')`,
      [body.task_id, auth.runner.id],
    );
  }
  return NextResponse.json({ ok: true });
}
