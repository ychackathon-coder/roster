import { NextResponse } from "next/server";
import { requireOrg } from "@/lib/auth";
import { activeProfile, createTask, insertEvent, recentEvents } from "@/lib/db";
import { buildAgentPrompt, decideHq } from "@/lib/hq/engine";
import { enforceLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Route a request through HQ. Writes the decision event, and — when the
 * decision targets an agent — queues a REAL task for a runner to execute with a
 * live Claude Code session. handle_direct answers without queueing work.
 */
export async function POST(req: Request) {
  const auth = await requireOrg();
  if ("error" in auth) return auth.error;
  const org = auth.ctx.org;

  const limited = await enforceLimit("hq", org.id);
  if (limited) return limited;

  const body = (await req.json().catch(() => ({}))) as { request?: string; team?: string };
  const request = body.request?.trim();
  if (!request) return NextResponse.json({ error: "request required" }, { status: 400 });
  if (request.length > 2000) {
    return NextResponse.json({ error: "request too long (2000 char max)" }, { status: 400 });
  }
  const team = (body.team ?? "Operations").trim().slice(0, 40) || "Operations";

  const profile = await activeProfile(org.id);
  if (!profile) {
    return NextResponse.json(
      { error: "No team profile — complete onboarding first", redirect: "/onboarding" },
      { status: 400 },
    );
  }

  const events = await recentEvents(org.id);
  const hq = await decideHq({
    profile,
    request,
    team,
    user: org.display_name,
    recent_events: events,
  });

  const event = await insertEvent({
    orgId: org.id,
    team,
    user: org.display_name,
    request,
    decision: hq.decision,
    subAgent: hq.sub_agent,
    reasoning: hq.reasoning,
    terminalLine: hq.terminal_line,
  });

  let task = null;
  if (hq.decision !== "handle_direct") {
    task = await createTask({
      orgId: org.id,
      eventId: event.id,
      request,
      team,
      requestedBy: org.display_name,
      subAgent: hq.sub_agent,
      prompt: buildAgentPrompt({ request, subAgent: hq.sub_agent, team, profile }),
    });
  }

  return NextResponse.json({
    decision: hq.decision,
    sub_agent: hq.sub_agent,
    reasoning: hq.reasoning,
    terminal_line: hq.terminal_line,
    event,
    task,
    meta: hq.meta,
  });
}
