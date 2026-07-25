import { NextResponse } from "next/server";
import { parseRepoInput } from "@/lib/fallback-repos";
import { indexRepo } from "@/lib/profile";
import { setActiveProfile, profileBackend, DEFAULT_TEAM } from "@/lib/profile-store";
import { insertEvent, listEvents } from "@/lib/events";
import { decideHq, toEvent } from "@/lib/hq";
import { recentEvents } from "@/lib/memory";
import { randomUUID } from "crypto";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { repo?: string; team?: string };
    const parsed = parseRepoInput(body.repo ?? "");
    if (!parsed) {
      return NextResponse.json(
        { error: "Provide a GitHub URL or owner/name" },
        { status: 400 },
      );
    }

    const { raw, profile } = await indexRepo(parsed.owner, parsed.name);

    // Durable now, not just a local JSON file — so employees joining later read
    // the manager's calibration instead of an empty profile.
    const stored = await setActiveProfile(profile, body.team ?? DEFAULT_TEAM);

    /**
     * The first calibrated HQ line, written into the shared events stream.
     *
     * THIS is the line the handover's hard requirement is actually about — "the
     * very first response after onboarding must cite a specific real detail from
     * the profile's traits." So it runs through the real engine and its
     * specificity gate, not the mock. If the model can't cite a real detail, the
     * deterministic floor quotes one verbatim.
     */
    const all = await listEvents();
    const hq = await decideHq({
      profile,
      request: `Calibrate HQ from ${profile.source_repo}`,
      team: "HQ",
      user: "onboarding",
      recent_events: recentEvents(all),
    });

    const calibrationEvent = toEvent({
      id: randomUUID(),
      team: "HQ",
      user: "onboarding",
      request: `Calibrate from ${profile.source_repo}`,
      hq,
    });

    let calibration_persisted = true;
    try {
      await insertEvent(calibrationEvent);
    } catch (err) {
      calibration_persisted = false;
      console.error(`[api/index-repo] insertEvent failed: ${(err as Error).message}`);
    }

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
      meta: {
        ...hq.meta,
        calibration_persisted,
        profile_backend: profileBackend(),
        profile_storage: stored.backend,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
