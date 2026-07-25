/**
 * Durable Team Profile storage — Supabase first, local JSON as fallback.
 *
 * WHY: Person D's handover called out that the active profile lives in
 * data/active-profile.json and "will not survive a real serverless deploy or
 * multiple concurrent sessions." That matters more than it sounds, because the
 * intended flow is manager-onboards-then-employees-join: with local JSON, each
 * employee's session reads a different file, or none, and lands uncalibrated.
 *
 * Same shape as events.ts: if Supabase env vars are present use it, otherwise
 * fall back to the file. So local dev keeps working with zero setup and a
 * deployed instance is correct.
 *
 * Requires data/supabase-team-profiles.sql to have been applied.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loadActiveProfile as loadLocal, saveActiveProfile as saveLocal } from "./session-store";
import type { TeamProfile } from "./types";

const TABLE = "team_profiles";
export const DEFAULT_TEAM = "default";

function supabaseConfig(): { url: string; key: string } | null {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    "";
  if (!url || !key) return null;
  return { url, key };
}

function supabase(): SupabaseClient | null {
  const cfg = supabaseConfig();
  return cfg ? createClient(cfg.url, cfg.key) : null;
}

export function profileBackend(): "supabase" | "local-json" {
  return supabaseConfig() ? "supabase" : "local-json";
}

type Row = {
  id: string;
  team: string;
  archetype: string;
  summary: string;
  traits: unknown;
  directive: string;
  source_repo: string;
};

function rowToProfile(row: Row): TeamProfile {
  return {
    archetype: row.archetype,
    summary: row.summary,
    // jsonb comes back parsed, but tolerate a JSON string just in case.
    traits: Array.isArray(row.traits)
      ? (row.traits as string[])
      : typeof row.traits === "string"
        ? ((): string[] => {
            try {
              const p = JSON.parse(row.traits);
              return Array.isArray(p) ? (p as string[]) : [];
            } catch {
              return [];
            }
          })()
        : [],
    directive: row.directive,
    source_repo: row.source_repo,
  };
}

/**
 * Read the active profile for a team.
 *
 * Falls back to the local file on ANY Supabase failure rather than throwing: HQ
 * cannot answer without a profile, and a transient database error should not turn
 * into a 500 in the middle of a demo.
 */
export async function getActiveProfile(
  team: string = DEFAULT_TEAM,
): Promise<TeamProfile | null> {
  const sb = supabase();
  if (sb) {
    try {
      const { data, error } = await sb
        .from(TABLE)
        .select("*")
        .eq("team", team)
        .eq("is_active", true)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw new Error(error.message);
      if (data) return rowToProfile(data as Row);

      // No row for this team yet — fall through to the local file so a profile
      // created before the table existed still works.
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[profile-store] Supabase read failed, using local file: ${message}`);
    }
  }
  return loadLocal();
}

/**
 * Persist a profile as the active one for a team.
 *
 * Always writes the local file too. That keeps a deployed instance and a laptop
 * in agreement during the demo, and means a Supabase outage degrades to
 * single-session behavior instead of losing the profile outright.
 */
export async function setActiveProfile(
  profile: TeamProfile,
  team: string = DEFAULT_TEAM,
): Promise<{ backend: "supabase" | "local-json"; persisted: boolean }> {
  await saveLocal(profile);

  const sb = supabase();
  if (!sb) return { backend: "local-json", persisted: true };

  try {
    // Deactivate the previous active row first — the partial unique index allows
    // only one active row per team, so inserting without this would conflict.
    const { error: deactivateError } = await sb
      .from(TABLE)
      .update({ is_active: false })
      .eq("team", team)
      .eq("is_active", true);
    if (deactivateError) throw new Error(deactivateError.message);

    const { error } = await sb.from(TABLE).insert({
      id: `${team}:${Date.now()}`,
      team,
      archetype: profile.archetype,
      summary: profile.summary,
      traits: profile.traits ?? [],
      directive: profile.directive,
      source_repo: profile.source_repo,
      is_active: true,
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);

    return { backend: "supabase", persisted: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(
      `[profile-store] Supabase write failed (local file still saved): ${message}\n` +
        `  If this says the relation does not exist, apply data/supabase-team-profiles.sql`,
    );
    return { backend: "local-json", persisted: true };
  }
}

/** Calibration history for a team — newest first. */
export async function profileHistory(
  team: string = DEFAULT_TEAM,
  limit = 10,
): Promise<TeamProfile[]> {
  const sb = supabase();
  if (!sb) {
    const local = await loadLocal();
    return local ? [local] : [];
  }
  try {
    const { data, error } = await sb
      .from(TABLE)
      .select("*")
      .eq("team", team)
      .order("updated_at", { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => rowToProfile(r as Row));
  } catch (err) {
    console.warn(`[profile-store] history unavailable: ${(err as Error).message}`);
    return [];
  }
}
