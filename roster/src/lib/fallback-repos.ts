export type FallbackRepo = {
  owner: string;
  name: string;
  fullName: string;
  blurb: string;
};

/** Small, real, public repos used as onboarding safety nets. */
export const FALLBACK_REPOS: FallbackRepo[] = [
  {
    owner: "chalk",
    name: "chalk",
    fullName: "chalk/chalk",
    blurb: "Tiny terminal styling library — fast, focused commits.",
  },
  {
    owner: "sindresorhus",
    name: "is",
    fullName: "sindresorhus/is",
    blurb: "Type-check helpers — high-velocity utility packaging.",
  },
  {
    owner: "expressjs",
    name: "morgan",
    fullName: "expressjs/morgan",
    blurb: "HTTP request logger middleware — stable Express ecosystem.",
  },
];

export function parseRepoInput(input: string): { owner: string; name: string } | null {
  const trimmed = input.trim().replace(/\/+$/, "");
  if (!trimmed) return null;

  // https://github.com/owner/name(.git)
  const urlMatch = trimmed.match(
    /^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/\s]+)\/([^/\s#?]+?)(?:\.git)?$/i,
  );
  if (urlMatch) {
    return { owner: urlMatch[1], name: urlMatch[2].replace(/\.git$/i, "") };
  }

  // owner/name
  const short = trimmed.match(/^([^/\s]+)\/([^/\s]+)$/);
  if (short) {
    return { owner: short[1], name: short[2].replace(/\.git$/i, "") };
  }

  return null;
}
