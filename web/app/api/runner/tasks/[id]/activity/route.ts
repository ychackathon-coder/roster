import { NextResponse } from "next/server";
import { requireRunner } from "@/lib/auth";
import { insertEvent, taskById, updateTask } from "@/lib/db";
import type { RunnerActivityBody } from "@/lib/contracts";

export const runtime = "nodejs";

/**
 * A real action from a live agent session — a file edit, a command, a status.
 * Bumps the task's activity counter (drives real progress on the dashboard) and
 * writes a terminal line when one is provided.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireRunner(req);
  if ("error" in auth) return auth.error;
  const { runner } = auth;
  const { id } = await ctx.params;

  // Scope check: the task must belong to this runner's org AND this runner.
  const task = await taskById(id, runner.org_id);
  if (!task || task.runner_id !== runner.id) {
    return NextResponse.json({ error: "not your task" }, { status: 404 });
  }

  const body = (await req.json().catch(() => null)) as RunnerActivityBody | null;
  if (!body?.activity?.kind) {
    return NextResponse.json({ error: "activity.kind required" }, { status: 400 });
  }

  const countable = body.activity.kind === "tool";
  await updateTask({ taskId: task.id, orgId: runner.org_id, bumpActivity: countable });

  if (body.terminal_line) {
    await insertEvent({
      orgId: runner.org_id,
      team: task.team,
      user: task.sub_agent,
      request: task.request,
      decision: "route_existing",
      subAgent: task.sub_agent,
      reasoning:
        body.activity.kind === "tool"
          ? `Live session action: ${body.activity.tool ?? "tool"}${body.activity.file_path ? ` on ${body.activity.file_path}` : ""}`
          : (body.activity.summary ?? "agent update"),
      terminalLine: body.terminal_line.slice(0, 400),
    });
  }

  return NextResponse.json({ ok: true });
}
