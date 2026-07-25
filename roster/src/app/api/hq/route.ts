import { NextResponse } from "next/server";
import { decideHq, toEvent } from "@/lib/hq";
import { listEvents, insertEvent, eventsBackend } from "@/lib/events";
import { getActiveProfile, profileBackend, DEFAULT_TEAM } from "@/lib/profile-store";
import { recentEvents } from "@/lib/memory";
import type { TeamProfile } from "@/lib/types";
import { randomUUID } from "crypto";

export const runtime = "nodejs";
// A model call plus two Supabase round trips. The engine degrades rather than
// hangs, but give it room so a slow first token isn't a 504.
export const maxDuration = 30;

/**
 * The real HQ endpoint. Same contract Person D's mock proved out:
 *   in  -> { request, team?, user?, profile? }
 *   out -> { decision, sub_agent, reasoning, terminal_line, event, ... }
 *
 * Behavior beyond the mock:
 *   - a model decides, and the response is REJECTED unless it cites a concrete
 *     detail from profile.traits (the hard requirement from the handover)
 *   - one corrective retry, then a deterministic floor that quotes a trait
 *     verbatim, so this endpoint works with no API key at all
 *   - memory is evidence rather than an instruction: HQ references the prior
 *     event by name but may still route differently when the request differs
 *   - the profile is read from Supabase when configured, so an employee session
 *     sees the manager's calibration
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      request?: string;
      team?: string;
      user?: string | null;
      profile?: TeamProfile;
    };

    const request = body.request?.trim();
    if (!request) {
      return NextResponse.json({ error: "request required" }, { status: 400 });
    }

    const team = body.team?.trim() || "Sales";

    // An explicit profile in the body wins (useful for tests and for the
    // frontend passing the just-confirmed profile without a round trip).
    const profile = body.profile ?? (await getActiveProfile(DEFAULT_TEAM));
    if (!profile) {
      return NextResponse.json(
        { error: "No active team profile — complete onboarding first" },
        { status: 400 },
      );
    }

    const all = await listEvents();
    const hq = await decideHq({
      profile,
      request,
      team,
      user: body.user ?? null,
      recent_events: recentEvents(all),
    });

    const event = toEvent({
      id: randomUUID(),
      team,
      user: body.user ?? null,
      request,
      hq,
    });

    // A logging failure must not discard a decision the user is waiting on.
    let event_persisted = true;
    try {
      await insertEvent(event);
    } catch (err) {
      event_persisted = false;
      console.error(`[api/hq] insertEvent failed: ${(err as Error).message}`);
    }

    return NextResponse.json({
      decision: hq.decision,
      sub_agent: hq.sub_agent,
      reasoning: hq.reasoning,
      terminal_line: hq.terminal_line,
      event,
      profile_cited: profile.source_repo,
      meta: {
        ...hq.meta,
        event_persisted,
        events_backend: eventsBackend(),
        profile_backend: profileBackend(),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[api/hq] ${message}`);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
