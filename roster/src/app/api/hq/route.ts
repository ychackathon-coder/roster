import { NextResponse } from "next/server";
import { mockHqDecide } from "@/lib/hq-mock";
import { listEvents, insertEvent } from "@/lib/events";
import { loadActiveProfile } from "@/lib/session-store";
import type { TeamProfile } from "@/lib/types";
import { randomUUID } from "crypto";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      request?: string;
      team?: string;
      user?: string | null;
      profile?: TeamProfile;
    };

    if (!body.request?.trim()) {
      return NextResponse.json({ error: "request required" }, { status: 400 });
    }

    const profile = body.profile ?? (await loadActiveProfile());
    if (!profile) {
      return NextResponse.json(
        { error: "No active team profile — complete onboarding first" },
        { status: 400 },
      );
    }

    const recent = await listEvents();
    const hq = mockHqDecide({
      profile,
      request: body.request.trim(),
      team: body.team ?? "Sales",
      user: body.user ?? null,
      recent_events: recent,
    });

    const event = {
      id: randomUUID(),
      team: body.team ?? "Sales",
      user: body.user ?? null,
      request: body.request.trim(),
      decision: hq.decision,
      sub_agent: hq.sub_agent,
      reasoning: hq.reasoning,
      terminal_line: hq.terminal_line,
      timestamp: new Date().toISOString(),
    };
    await insertEvent(event);

    return NextResponse.json({ ...hq, event, profile_cited: profile.source_repo });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
