import { NextResponse } from "next/server";
import { requireOrg } from "@/lib/auth";
import { activeProfile, insertEvent, recentEvents, setActiveProfile } from "@/lib/db";
import { decideHq } from "@/lib/hq/engine";
import { indexRepo } from "@/lib/indexing/profile";
import { parseRepoInput } from "@/lib/indexing/fallback-repos";
import { enforceLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";
// GitHub fetch + (possibly slow) model derivation.
export const maxDuration = 60;

export async function POST(req: Request) {
  const auth = await requireOrg();
  if ("error" in auth) return auth.error;
  const { org, display_name } = auth.ctx.org ? { org: auth.ctx.org, display_name: auth.ctx.org.display_name } : { org: null, display_name: "" };
  if (!org) return NextResponse.json({ error: "no company" }, { status: 409 });

  const limited = await enforceLimit("indexRepo", org.id);
  if (limited) return limited;

  const body = (await req.json().catch(() => ({}))) as { repo?: string };
  const parsed = parseRepoInput(body.repo ?? "");
  if (!parsed) {
    return NextResponse.json({ error: "Provide a GitHub URL or owner/name" }, { status: 400 });
  }

  try {
    const { raw, profile } = await indexRepo(parsed.owner, parsed.name);
    await setActiveProfile(org.id, profile);

    // First calibrated line into the stream — runs through the real engine and
    // its specificity gate, since this is the product's proof point.
    const events = await recentEvents(org.id);
    const hq = await decideHq({
      profile,
      request: `Calibrate HQ from ${profile.source_repo}`,
      team: "HQ",
      user: display_name || "onboarding",
      recent_events: events,
    });
    await insertEvent({
      orgId: org.id,
      team: "HQ",
      user: display_name || "onboarding",
      request: `Calibrate from ${profile.source_repo}`,
      decision: hq.decision,
      subAgent: hq.sub_agent,
      reasoning: hq.reasoning,
      terminalLine: hq.terminal_line,
    });

    return NextResponse.json({
      profile,
      raw: {
        fullName: raw.fullName,
        language: raw.language,
        stars: raw.stars,
        commitCount: raw.commits.length,
      },
      meta: hq.meta,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Current active profile. */
export async function GET() {
  const auth = await requireOrg();
  if ("error" in auth) return auth.error;
  const profile = await activeProfile(auth.ctx.org.id);
  return NextResponse.json({ profile });
}
