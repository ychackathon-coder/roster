/**
 * Turns fetched HTML into a compact plain-text brief for the model.
 * Regex rather than a parser: the input is untrusted and we only ever read it,
 * never render it, so a DOM is not worth the bundle or the CPU.
 */

const MAX_CHARS = 6000;

export interface ExtractedPage {
  title: string | null;
  description: string | null;
  text: string;
}

export function extractText(html: string): ExtractedPage {
  const title = firstMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i);

  const description =
    firstMatch(
      html,
      /<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i,
    ) ??
    firstMatch(
      html,
      /<meta[^>]+content=["']([^"']*)["'][^>]*name=["']description["']/i,
    ) ??
    firstMatch(
      html,
      /<meta[^>]+property=["']og:description["'][^>]*content=["']([^"']*)["']/i,
    );

  const body = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|template|iframe)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ");

  const text = collapse(decodeEntities(body)).slice(0, MAX_CHARS);

  return {
    title: title ? collapse(decodeEntities(title)) || null : null,
    description: description ? collapse(decodeEntities(description)) || null : null,
    text,
  };
}

function firstMatch(source: string, pattern: RegExp): string | null {
  const match = source.match(pattern);
  return match && match[1] ? match[1] : null;
}

function collapse(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  mdash: "-",
  ndash: "-",
  hellip: "...",
  rsquo: "'",
  lsquo: "'",
  rdquo: '"',
  ldquo: '"',
};

function decodeEntities(value: string): string {
  return value
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, code: string) => {
      if (code.startsWith("#")) {
        const num = code[1]?.toLowerCase() === "x"
          ? parseInt(code.slice(2), 16)
          : parseInt(code.slice(1), 10);
        return Number.isFinite(num) ? String.fromCodePoint(num) : whole;
      }
      return ENTITIES[code.toLowerCase()] ?? whole;
    });
}

/** Builds the single text blob handed to the model. */
export function toBrief(page: ExtractedPage, host: string): string {
  const parts = [`Website: ${host}`];
  if (page.title) parts.push(`Page title: ${page.title}`);
  if (page.description) parts.push(`Meta description: ${page.description}`);
  if (page.text) parts.push(`Page text: ${page.text}`);
  return parts.join("\n");
}
