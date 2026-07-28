/**
 * Memory — the "we've seen this before" behavior (§4.3).
 *
 * Deterministic on purpose: token overlap, no embeddings, no model call. It runs
 * in microseconds, it is explainable on stage ("these three words matched"), and
 * it cannot hallucinate a match that isn't there.
 *
 * ONE DELIBERATE DIFFERENCE FROM THE MOCK: hq-mock.ts adopts the matched event's
 * decision and sub_agent wholesale. That is wrong in the case that matters — two
 * requests can be worded almost identically and still need different handling
 * ("refresh the one-pager" vs "delete the one-pager"). Here a match is EVIDENCE
 * handed to the decision step, which stays free to disagree with it. The demo
 * beat is unaffected, because HQ still cites the prior event by name.
 */
import type { EventRow } from "@/lib/contracts";

const STOPWORDS = new Set([
  "with", "from", "that", "this", "than", "then", "them", "they", "have",
  "into", "more", "most", "some", "such", "very", "when", "will", "would",
  "should", "could", "need", "needs", "needed", "want", "wants", "please",
  "team", "next", "week", "make", "made", "just", "also", "about", "there",
  "these", "those", "your", "ours", "each", "been", "over", "back",
]);

function tokenize(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 3 && !STOPWORDS.has(w)),
  );
}

export type MemoryMatch = {
  event: EventRow;
  score: number;
  /** The tokens that actually matched — so reasoning can be concrete. */
  sharedTerms: string[];
};

/**
 * Jaccard-style overlap, symmetric so a long historical request doesn't
 * out-score a short one purely on length.
 */
export function similarity(a: string, b: string): { score: number; shared: string[] } {
  const A = tokenize(a);
  const B = tokenize(b);
  if (!A.size || !B.size) return { score: 0, shared: [] };
  const shared: string[] = [];
  for (const t of A) if (B.has(t)) shared.push(t);
  const union = new Set([...A, ...B]).size;
  return { score: shared.length / union, shared };
}

/**
 * Threshold note: 0.2 on Jaccard, not the mock's 0.35 on max-set overlap. The
 * two metrics aren't comparable — Jaccard divides by the UNION, so the same pair
 * scores lower. Verified against the intended demo pair in seed-data.ts
 * ("Need an updated one-pager for the enterprise customer demo next week" vs
 * "Can we refresh the sales one-pager for the enterprise demo?"), which must
 * match. There is a test pinning exactly that.
 */
export const MEMORY_THRESHOLD = 0.2;

export function findMemoryMatch(
  request: string,
  recent: readonly EventRow[],
  threshold = MEMORY_THRESHOLD,
): MemoryMatch | null {
  let best: MemoryMatch | null = null;
  for (const event of recent) {
    const { score, shared } = similarity(request, event.request);
    if (!best || score > best.score) {
      best = { event, score, sharedTerms: shared };
    }
  }
  return best && best.score >= threshold ? best : null;
}

/** Newest first, capped — HQ only needs recent history, not the whole table. */
export function recentEvents(
  events: readonly EventRow[],
  limit = 25,
): EventRow[] {
  return [...events]
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, limit);
}

/** Human-readable age, for reasoning text. */
export function describeAge(timestamp: string): string {
  const ms = Date.now() - Date.parse(timestamp);
  if (!Number.isFinite(ms) || ms < 0) return "previously";
  const days = Math.floor(ms / 86_400_000);
  if (days >= 1) return `${days} day${days === 1 ? "" : "s"} ago`;
  const hours = Math.floor(ms / 3_600_000);
  if (hours >= 1) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  return "earlier today";
}
