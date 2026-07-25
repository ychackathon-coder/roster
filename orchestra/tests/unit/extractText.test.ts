import { describe, expect, it } from "vitest";

import { extractText, toBrief } from "@/lib/scan/extractText";

const RICH = `
<!doctype html>
<html>
  <head>
    <title>Acme Coffee &amp; Co</title>
    <meta name="description" content="Small-batch roasting since 2011.">
    <style>body { color: red }</style>
    <script>window.__DATA__ = {"secret": "should not appear"}</script>
  </head>
  <body>
    <svg><path d="M0 0"/></svg>
    <h1>We roast coffee</h1>
    <p>Three cafes   and a wholesale line.</p>
    <noscript>Enable JavaScript</noscript>
  </body>
</html>
`;

describe("extractText", () => {
  it("pulls title, meta description, and body copy", () => {
    const page = extractText(RICH);
    expect(page.title).toBe("Acme Coffee & Co");
    expect(page.description).toBe("Small-batch roasting since 2011.");
    expect(page.text).toContain("We roast coffee");
    expect(page.text).toContain("Three cafes and a wholesale line.");
  });

  it("drops script, style, noscript, and svg content", () => {
    const page = extractText(RICH);
    expect(page.text).not.toContain("should not appear");
    expect(page.text).not.toContain("color: red");
    expect(page.text).not.toContain("Enable JavaScript");
    expect(page.text).not.toContain("M0 0");
  });

  it("falls back to og:description when there is no meta description", () => {
    const page = extractText(
      `<meta property="og:description" content="A payments API."><p>hi</p>`,
    );
    expect(page.description).toBe("A payments API.");
  });

  it("reads a reversed meta attribute order", () => {
    const page = extractText(`<meta content="Reversed order." name="description">`);
    expect(page.description).toBe("Reversed order.");
  });

  it("survives an empty document", () => {
    const page = extractText("");
    expect(page).toEqual({ title: null, description: null, text: "" });
  });

  it("survives a script-only document", () => {
    const page = extractText("<script>var a = 1 < 2 && 3 > 2;</script>");
    expect(page.text).toBe("");
  });

  it("decodes numeric and named entities", () => {
    const page = extractText("<p>Caf&#233; &amp; bar &nbsp;open</p>");
    expect(page.text).toBe("Café & bar open");
  });

  it("truncates very long bodies", () => {
    const page = extractText(`<p>${"word ".repeat(4000)}</p>`);
    expect(page.text.length).toBeLessThanOrEqual(6000);
  });

  it("builds a brief that always names the host", () => {
    const brief = toBrief(extractText(RICH), "acme.coffee");
    expect(brief).toContain("Website: acme.coffee");
    expect(brief).toContain("Page title: Acme Coffee & Co");
  });
});
