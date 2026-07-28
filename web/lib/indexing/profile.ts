import OpenAI from "openai";
import { z } from "zod";
import type { RepoRawData, TeamProfile } from "@/lib/indexing/types";

const TeamProfileSchema = z.object({
  archetype: z.string().min(2),
  summary: z.string().min(20),
  traits: z.array(z.string().min(8)).min(2).max(6),
  directive: z.string().min(20),
  source_repo: z.string().min(3),
});

function buildPrompt(raw: RepoRawData): string {
  const commitBlock = raw.commits
    .map((c) => `- ${c.sha} (${c.author ?? "unknown"}): ${c.message}`)
    .join("\n");

  return `You are calibrating Roster's HQ Agent from a REAL GitHub repository.

Return ONLY valid JSON with exactly these keys:
{
  "archetype": "short label for how this team builds",
  "summary": "1-2 plain-language sentences about their working pattern",
  "traits": ["2-5 concrete observations that quote or name REAL details from the data below"],
  "directive": "ONE sentence telling HQ how to change its routing/spawn behavior for THIS team",
  "source_repo": "owner/name"
}

HARD RULES:
- traits MUST name at least two specifics from the data: e.g. an actual README phrase, a real filename/package name, a real commit message fragment, the primary language, or a clear commit cadence pattern visible in the list.
- Forbidden generic filler: "collaborative", "agile", "values quality", "iterates quickly" unless tied to a named artifact.
- If you cannot cite a real detail, invent nothing — use what is present.
- directive must be operational for an HQ router (handoff size, spawn eagerness, reuse vs new agent), not a vibe.

REPO METADATA:
- full_name: ${raw.fullName}
- url: ${raw.url}
- description: ${raw.description ?? "(none)"}
- language: ${raw.language ?? "(unknown)"}
- topics: ${raw.topics.join(", ") || "(none)"}
- stars: ${raw.stars}

RECENT COMMITS:
${commitBlock}

README (truncated):
"""
${raw.readme.slice(0, 8000)}
"""`;
}

function isTooGeneric(profile: TeamProfile, raw: RepoRawData): string | null {
  const blob = `${profile.traits.join(" ")} ${profile.directive} ${profile.summary}`.toLowerCase();
  const repoToken = raw.fullName.split("/")[1]?.toLowerCase() ?? "";
  const hasRepoName = blob.includes(repoToken) || blob.includes(raw.fullName.toLowerCase());
  const commitFrag = raw.commits
    .slice(0, 5)
    .some((c) => {
      const words = c.message
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((w) => w.length > 4);
      return words.some((w) => blob.includes(w));
    });
  const lang =
    raw.language && blob.includes(raw.language.toLowerCase());
  const readmeHit = raw.readme
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 6)
    .slice(0, 40)
    .some((w) => blob.includes(w));

  const specificityScore = [hasRepoName, commitFrag, lang, readmeHit].filter(Boolean).length;
  if (specificityScore < 2) {
    return `specificity_score=${specificityScore} (need >=2 of repo-name/commit/lang/readme hits)`;
  }
  return null;
}

function nvidiaClient(): OpenAI | null {
  // HQ_MODEL_ENABLED=false disables every model call in the product, including
  // profile derivation — without it, a dead provider costs onboarding two full
  // 20s timeouts before the deterministic fallback kicks in (measured: 49s).
  if (/^(0|false|no)$/i.test(process.env.HQ_MODEL_ENABLED ?? "")) return null;
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) return null;
  return new OpenAI({
    apiKey,
    baseURL:
      process.env.NVIDIA_BASE_URL || "https://integrate.api.nvidia.com/v1",
    // One bounded attempt per loop iteration. The SDK's default (2 silent
    // retries, no timeout) turned an unreachable provider into a multi-minute
    // onboarding hang.
    maxRetries: 0,
    timeout: 20_000,
  });
}

export async function deriveTeamProfile(raw: RepoRawData): Promise<TeamProfile> {
  const client = nvidiaClient();
  const model =
    process.env.NVIDIA_MODEL || "meta/llama-3.3-70b-instruct";

  let lastError: string | null = null;

  // No key -> straight to the deterministic profile built from the real repo
  // data. Onboarding must never depend on a model being reachable.
  for (let attempt = 0; client && attempt < 2; attempt++) {
    const extra =
      attempt === 0
        ? ""
        : `\n\nPREVIOUS OUTPUT WAS TOO GENERIC (${lastError}). Rewrite with MORE direct quotes from commit messages and README phrases. Name the package/repo explicitly in traits.`;

    // The call itself may THROW (timeout, 4xx, network) — that is a provider
    // failure, not a reason to fail onboarding. Caught here so the loop's
    // fallback path handles it like any other bad attempt. This exact hole
    // took down e2e: NVIDIA answered 400 and the throw skipped the fallback.
    let text = "";
    try {
      const completion = await client.chat.completions.create({
        model,
        messages: [{ role: "user", content: buildPrompt(raw) + extra }],
        temperature: 0.2,
        top_p: 0.7,
        max_tokens: 1024,
        stream: false,
      });
      text = completion.choices[0]?.message?.content ?? "";
    } catch (err) {
      lastError = `provider call failed: ${(err as Error).message}`;
      console.warn(`[indexing] ${lastError} — attempt ${attempt + 1}`);
      continue;
    }

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      lastError = "no JSON object in model response";
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      lastError = "JSON parse failed";
      continue;
    }

    const result = TeamProfileSchema.safeParse({
      ...(parsed as object),
      source_repo: (parsed as { source_repo?: string }).source_repo ?? raw.fullName,
    });

    if (!result.success) {
      lastError = result.error.message;
      continue;
    }

    const genericWhy = isTooGeneric(result.data, raw);
    if (genericWhy) {
      lastError = genericWhy;
      continue;
    }

    return { ...result.data, source_repo: raw.fullName };
  }

  // Last resort: deterministic profile from raw data so the demo never hard-fails
  return fallbackProfile(raw, lastError);
}

function fallbackProfile(raw: RepoRawData, _why: string | null): TeamProfile {
  const sampleCommits = raw.commits
    .slice(0, 3)
    .map((c) => `"${c.message}"`)
    .join("; ");
  const readmeLine =
    raw.readme
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l.length > 20 && !l.startsWith("#") && !l.startsWith("[")) ??
    raw.description ??
    "no readme summary";

  return {
    archetype: "Evidence-Led Maintainer",
    summary: `Team behind ${raw.fullName} ships ${raw.language ?? "multi-language"} work with a clear public surface (${raw.stars} stars) and README framing around: ${readmeLine.slice(0, 120)}.`,
    traits: [
      `Repo ${raw.fullName} primary language is ${raw.language ?? "unspecified"}; recent commits include ${sampleCommits || "none listed"}.`,
      `README/description signal: ${readmeLine.slice(0, 160)}`,
      `Commit cadence sample size ${raw.commits.length} recent messages fetched live from GitHub.`,
    ],
    directive:
      "Prefer small, frequent handoffs that mirror this repo's tight commit messages; spawn a specialist only when the request names a surface absent from recent commit themes.",
    source_repo: raw.fullName,
  };
}

export async function indexRepo(
  owner: string,
  name: string,
): Promise<{ raw: RepoRawData; profile: TeamProfile }> {
  const { fetchRepoRaw } = await import("./github");
  const raw = await fetchRepoRaw(owner, name);
  const profile = await deriveTeamProfile(raw);
  return { raw, profile };
}
