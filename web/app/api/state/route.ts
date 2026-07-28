import { NextResponse } from "next/server";
import { getUserContext } from "@/lib/auth";
import { activeProfile, orgRunners, orgTasks, recentEvents } from "@/lib/db";
import { buildSnapshot } from "@/lib/mapping";
import { sweepStuckTasks } from "@/lib/sweep";

export const runtime = "nodejs";

/** Everything the dashboard needs, org-scoped by session, in one poll. */
export async function GET() {
  const ctx = await getUserContext();
  if (!ctx) return NextResponse.json({ error: "not signed in" }, { status: 401 });
  if (!ctx.org) {
    // Dashboard uses org:null as its cue to route the user to /onboarding.
    return NextResponse.json({
      org: null, profile: null, events: [], tasks: [], runners: [],
      operations: [], agents: [], activity: [], terminal: [],
      metrics: { activeAgents: 0, tasksCompleted: 0, interventionRate: 0, pendingApprovals: 0, runnersOnline: 0 },
    });
  }

  // Self-healing: any open dashboard recovers its own org's stuck tasks, so
  // recovery works even where scheduled crons don't (Vercel Hobby = daily).
  await sweepStuckTasks(ctx.org.id).catch((err) =>
    console.warn(`[state] sweep failed: ${(err as Error).message}`),
  );

  const [profile, events, tasks, runners] = await Promise.all([
    activeProfile(ctx.org.id),
    recentEvents(ctx.org.id),
    orgTasks(ctx.org.id),
    orgRunners(ctx.org.id),
  ]);

  return NextResponse.json(
    buildSnapshot({
      org: { id: ctx.org.id, name: ctx.org.name, invite_code: ctx.org.invite_code },
      profile,
      events,
      tasks,
      runners,
    }),
  );
}
