/**
 * The hard requirement, enforced in code.
 *
 * Person D's handover: "whatever HQ implementation you build, the very first
 * response after onboarding must cite a specific real detail from the profile's
 * traits field, not just restate the archetype label. That specificity is the
 * entire proof point of the demo, generic output breaks it."
 *
 * A prompt asking nicely for specificity is a hope, not a guarantee — and the
 * failure is invisible: the response still looks fine, it just quietly stops
 * proving anything. So every HQ response is validated against the actual traits
 * before it leaves the building, and anything that fails is retried and then
 * replaced by a deterministic line that quotes a trait verbatim.
 *
 * This mirrors the specificity gate already in profile.ts (isTooGeneric), which
 * does the same job one stage earlier for profile derivation.
 */
import type { TeamProfile } from "./types";

/** Words too common to prove anything, even when they appear in a trait. */
const STOPWORDS = new Set([
  "about", "above", "across", "after", "again", "against", "their", "there",
  "these", "those", "through", "under", "where", "which", "while", "would",
  "should", "could", "team", "teams", "repo", "repository", "commit", "commits",
  "readme", "code", "codebase", "project", "using", "used", "uses", "with",
  "from", "that", "this", "than", "then", "them", "they", "have", "having",
  "into", "more", "most", "much", "other", "over", "same", "some", "such",
  "very", "when", "will", "work", "works", "working", "detail", "details",
  "specific", "clear", "small", "recent", "primary", "language", "based",
]);

/**
 * Distinctive strings pulled out of the profile's traits.
 *
 * These are what a response has to hit to count as citing a real detail. Drawn
 * only from `traits` — deliberately NOT from `archetype` or `summary`, because
 * restating the archetype label is exactly what the requirement forbids.
 */
export function extractTraitAnchors(profile: TeamProfile): string[] {
  const anchors = new Set<string>();

  for (const trait of profile.traits ?? []) {
    // 1. Quoted phrases — usually a literal commit message or README line, and
    //    the strongest possible evidence of a real citation.
    for (const m of trait.matchAll(/["“”']([^"“”']{6,})["“”']/g)) {
      const phrase = m[1]?.trim();
      if (phrase) anchors.add(phrase.toLowerCase());
    }

    // 2. Identifier-shaped tokens: filenames, package names, owner/repo,
    //    CamelCase, snake_case, kebab-case, versions.
    for (const m of trait.matchAll(
      /\b[\w.@/-]*(?:[a-z][A-Z]|[/_.-]|\d)[\w.@/-]*\b/g,
    )) {
      const tok = m[0].replace(/^[.\-/]+|[.\-/,;:]+$/g, "");
      if (tok.length >= 4 && /[a-zA-Z]/.test(tok)) anchors.add(tok.toLowerCase());
    }

    // 3. Ordinary long words, minus the ones that prove nothing.
    for (const w of trait.toLowerCase().split(/[^a-z0-9]+/)) {
      if (w.length >= 6 && !STOPWORDS.has(w)) anchors.add(w);
    }
  }

  // The repo name is a real, checkable detail.
  if (profile.source_repo) {
    anchors.add(profile.source_repo.toLowerCase());
    const bare = profile.source_repo.split("/")[1];
    if (bare && bare.length >= 3) anchors.add(bare.toLowerCase());
  }

  return [...anchors];
}

/**
 * Phrases that signal the model fell back to vibes. Mirrors the forbidden-filler
 * list in profile.ts, extended with router-flavored hedging.
 */
const GENERIC_FILLER: readonly RegExp[] = [
  /\bcollaborative\b/i,
  /\bagile\b/i,
  /\bvalues quality\b/i,
  /\biterates quickly\b/i,
  /\bfast[- ]moving\b/i,
  /\bbest practices\b/i,
  /\bhigh[- ]performing\b/i,
  /\bmodern (?:stack|tooling|codebase)\b/i,
  /\bstrong (?:engineering|culture)\b/i,
  /\bwell[- ]maintained\b/i,
  /\bgiven (?:the|your) team'?s? (?:profile|style|nature)\b/i,
  /\bbased on (?:the|your) (?:archetype|profile)\b/i,
];

export type SpecificityFinding = { code: string; detail: string };

export type SpecificityResult = {
  ok: boolean;
  /** Anchors the text actually hit — useful for logging what proved it. */
  matched: string[];
  findings: SpecificityFinding[];
};

/**
 * Does this text cite a real, checkable detail from the profile's traits?
 *
 * `text` should be the customer-visible surface — the terminal_line plus the
 * reasoning. Passing only the archetype through will (correctly) fail.
 */
export function checkSpecificity(
  text: string,
  profile: TeamProfile,
): SpecificityResult {
  const findings: SpecificityFinding[] = [];
  const haystack = text.toLowerCase();
  const anchors = extractTraitAnchors(profile);
  const matched = anchors.filter((a) => haystack.includes(a));

  if (matched.length === 0) {
    findings.push({
      code: "no_trait_citation",
      detail:
        "cites nothing from profile.traits — this is the demo's proof point, so it cannot ship",
    });
  }

  for (const re of GENERIC_FILLER) {
    const m = re.exec(text);
    if (m) findings.push({ code: "generic_filler", detail: m[0] });
  }

  // Restating the archetype and nothing else is the specific failure Person D
  // called out by name.
  const archetype = (profile.archetype ?? "").toLowerCase().trim();
  if (archetype && haystack.includes(archetype) && matched.length === 0) {
    findings.push({
      code: "archetype_only",
      detail: `repeats the archetype label "${profile.archetype}" without any concrete detail`,
    });
  }

  return { ok: findings.length === 0, matched, findings };
}

/**
 * The trait most relevant to a request, so the model is pointed at the useful
 * one instead of always reaching for traits[0].
 *
 * Deterministic token overlap — no model call, so this is free and explainable.
 */
export function mostRelevantTrait(
  profile: TeamProfile,
  request: string,
): string {
  const traits = profile.traits ?? [];
  if (traits.length === 0) return profile.summary ?? "";

  const reqTokens = new Set(
    request
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 3 && !STOPWORDS.has(w)),
  );

  let best = traits[0]!;
  let bestScore = -1;
  for (const trait of traits) {
    const tTokens = trait
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 3 && !STOPWORDS.has(w));
    const score = tTokens.reduce((n, w) => n + (reqTokens.has(w) ? 1 : 0), 0);
    if (score > bestScore) {
      bestScore = score;
      best = trait;
    }
  }
  return best;
}

/** Trim a trait for inclusion in a one-line terminal string. */
export function condenseTrait(trait: string, max = 150): string {
  const clean = trait.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  // Cut on a word boundary so a quoted commit message isn't sliced mid-word.
  const cut = clean.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut}…`;
}
