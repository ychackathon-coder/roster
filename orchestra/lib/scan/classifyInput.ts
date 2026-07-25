/**
 * Decides whether the hero input is a website to fetch or prose to read.
 * Pure, so it can run identically on the client (for the optimistic terminal
 * lines) and on the server (for the real pipeline).
 */

export type Classification =
  | { kind: "url"; url: string; host: string }
  | { kind: "description"; text: string }
  | { kind: "empty" };

/**
 * A bare domain looks like `label.tld` with an optional path. We deliberately
 * require a known-shaped TLD (2+ letters) so prose containing a period, like
 * "we sell shoes. online.", does not get misread as a domain.
 */
const BARE_DOMAIN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9-]+)*\.[a-z]{2,}(\/\S*)?$/i;

export function classifyInput(raw: string): Classification {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { kind: "empty" };

  // Anything with whitespace is prose, even if it happens to contain a link.
  const hasSpace = /\s/.test(trimmed);

  if (!hasSpace) {
    const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const candidate = /^https?:\/\//i.test(trimmed) ? stripScheme(trimmed) : trimmed;

    if (BARE_DOMAIN.test(candidate)) {
      try {
        const url = new URL(withScheme);
        return { kind: "url", url: url.toString(), host: url.hostname.replace(/^www\./, "") };
      } catch {
        // fall through to description
      }
    }
  }

  return { kind: "description", text: trimmed };
}

function stripScheme(value: string): string {
  return value.replace(/^https?:\/\//i, "");
}

/** Client-side submit guard. Returns an error string, or null when valid. */
export function validateInput(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return "Enter a company site or describe the business.";
  if (trimmed.length < 4) return "That is too short to scan.";
  if (trimmed.length > 600) return "Keep it under 600 characters.";

  const classification = classifyInput(trimmed);
  if (classification.kind === "description") {
    // Junk guard: prose needs at least a couple of real words.
    const words = trimmed.split(/\s+/).filter((w) => /[a-z]{2,}/i.test(w));
    if (words.length < 2) return "Enter a valid URL, or describe the business in a few words.";
  }
  return null;
}
