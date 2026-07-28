import { NextResponse } from "next/server";
import { requireRunner } from "@/lib/auth";
import { activeProfile, claimNextTask, touchRunner, updateTask } from "@/lib/db";
import type { NextTaskResponse } from "@/lib/contracts";

export const runtime = "nodejs";

/**
 * Runner poll: atomically claim the oldest queued task for this runner's org.
 * ?workspace=<dir> updates what the dashboard shows the runner working in.
 */
export async function GET(req: Request) {
  const auth = await requireRunner(req);
  if ("error" in auth) return auth.error;
  const { runner } = auth;

  const workspace = new URL(req.url).searchParams.get("workspace") ?? undefined;
  if (workspace) await touchRunner(runner.id, workspace);

  const task = await claimNextTask(runner.org_id, runner.id);
  if (!task) return NextResponse.json({ task: null } satisfies NextTaskResponse);

  await updateTask({ taskId: task.id, orgId: runner.org_id, status: "running" });
  const profile = await activeProfile(runner.org_id);

  return NextResponse.json({
    task: {
      id: task.id,
      request: task.request,
      sub_agent: task.sub_agent,
      prompt: task.prompt,
      team: task.team,
      profile,
    },
  } satisfies NextTaskResponse);
}
