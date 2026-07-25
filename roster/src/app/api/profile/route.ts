import { NextResponse } from "next/server";
import { getActiveProfile, profileBackend, DEFAULT_TEAM } from "@/lib/profile-store";

export const runtime = "nodejs";

/**
 * The active team profile.
 *
 * Now reads through profile-store, so a deployed instance serves the same
 * profile to every session instead of whatever happens to be in this container's
 * local JSON file. Falls back to that file when Supabase is unconfigured.
 */
export async function GET(req: Request) {
  const team = new URL(req.url).searchParams.get("team") ?? DEFAULT_TEAM;
  const profile = await getActiveProfile(team);
  return NextResponse.json({
    profile,
    team,
    backend: profileBackend(),
  });
}
