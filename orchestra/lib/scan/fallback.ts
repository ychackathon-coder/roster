import fallbackRoster from "@/data/fallback-roster.json";
import { ScanPayloadSchema, type ScanPayload } from "@/lib/types";

/**
 * The last line of defence. Returns a credible generic org so Act 2 always has
 * something to deal out, personalised with whatever we do know about the input.
 */
export function fallbackPayload(opts: { host: string | null; text: string | null }): ScanPayload {
  const base = ScanPayloadSchema.parse(fallbackRoster);
  const name = opts.host ? titleFromHost(opts.host) : nameFromText(opts.text);

  return {
    ...base,
    profile: {
      ...base.profile,
      name: name ?? base.profile.name,
    },
  };
}

/** `acme-tools.co.uk` becomes `Acme Tools`. */
export function titleFromHost(host: string): string {
  const label = host.replace(/^www\./, "").split(".")[0] ?? host;
  return label
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/** Falls back to the first few words of a prose description. */
function nameFromText(text: string | null): string | null {
  if (!text) return null;
  const words = text.trim().split(/\s+/).slice(0, 3).join(" ");
  return words.length > 2 ? words.replace(/[.,;:]$/, "") : null;
}
