import { NextResponse } from "next/server";
import { parseRepoInput } from "@/lib/fallback-repos";
import { indexRepo } from "@/lib/profile";
import { saveActiveProfile } from "@/lib/session-store";
import { insertEvent, listEvents } from "@/lib/events";
import { mockHqDecide } from "@/lib/hq-mock";
import { randomUUID } from "crypto";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { repo?: string };
    const parsed = parseRepoInput(body.repo ?? "");
    if (!parsed) {
      return NextResponse.json(
        { error: "Provide a GitHub URL or owner/name" },
        { status: 400 },
      );
    }

    const { raw, profile } = await indexRepo(parsed.owner, parsed.name);
    await saveActiveProfile(profile);

    // First calibrated HQ line written into the shared events stream
    const recent = await listEvents();
    const hq = mockHqDecide({
      profile,
      request: `Calibrate HQ from ${profile.source_repo}`,
      team: "HQ",
      user: "onboarding",
      recent_events: recent,
    });

    const calibrationEvent = {
      id: randomUUID(),
      team: "HQ",
      user: "onboarding",
      request: `Calibrate from ${profile.source_repo}`,
      decision: hq.decision,
      sub_agent: hq.sub_agent,
      reasoning: hq.reasoning,
      terminal_line: hq.terminal_line,
      timestamp: new Date().toISOString(),
    };
    await insertEvent(calibrationEvent);

    return NextResponse.json({
      profile,
      raw: {
        fullName: raw.fullName,
        url: raw.url,
        description: raw.description,
        language: raw.language,
        stars: raw.stars,
        commitCount: raw.commits.length,
        sampleCommits: raw.commits.slice(0, 5),
      },
      calibration: calibrationEvent,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
