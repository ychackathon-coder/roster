import { NextResponse } from "next/server";
import { requireRunner } from "@/lib/auth";
import { insertEvent, taskById, updateTask } from "@/lib/db";
import type { CompleteTaskBody } from "@/lib/contracts";

export const runtime = "nodejs";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireRunner(req);
  if ("error" in auth) return auth.error;
  const { runner } = auth;
  const { id } = await ctx.params;

  const task = await taskById(id, runner.org_id);
  if (!task || task.runner_id !== runner.id) {
    return NextResponse.json({ error: "not your task" }, { status: 404 });
  }

  const body = (await req.json().catch(() => null)) as CompleteTaskBody | null;
  const status = body?.status === "failed" ? "failed" : "done";
  const summary = (body?.summary ?? "").slice(0, 2000);

  await updateTask({ taskId: task.id, orgId: runner.org_id, status, resultSummary: summary });

  await insertEvent({
    orgId: runner.org_id,
    team: task.team,
    user: task.sub_agent,
    request: task.request,
    decision: "route_existing",
    subAgent: task.sub_agent,
    reasoning: summary || `${task.sub_agent} ${status === "done" ? "completed" : "failed"} the task.`,
    terminalLine: `[${task.sub_agent}] ${status === "done" ? "✓ completed" : "✗ failed"}: ${task.request.slice(0, 140)}${summary ? ` — ${summary.slice(0, 160)}` : ""}`,
  });

  return NextResponse.json({ ok: true, status });
}
