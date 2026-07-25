import { describe, expect, it, vi } from "vitest";

import { runScan, type Inferencer } from "@/lib/scan/runScan";
import { ScanPayloadSchema } from "@/lib/types";

const GOOD_PAYLOAD = {
  profile: {
    name: "Acme Coffee",
    summary: "Roasts and sells coffee to cafes and at wholesale.",
    industry: "Specialty coffee",
    surfaces: ["Wholesale orders", "Cafe staffing", "Online store"],
  },
  agents: [
    { role: "Lead", mandate: "Owns the queue end to end.", tools: ["Slack"], reportsTo: null },
    { role: "Orders", mandate: "Handles wholesale orders.", tools: ["Shopify"], reportsTo: "Lead" },
    { role: "Support", mandate: "Answers customer email.", tools: ["Gmail"], reportsTo: "Lead" },
  ],
};

const HTML = `<html><head><title>Acme Coffee</title></head><body><p>We roast coffee.</p></body></html>`;

function htmlResponse(body = HTML): Response {
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function inferencerReturning(...responses: string[]): Inferencer {
  const queue = [...responses];
  return { complete: vi.fn(async () => queue.shift() ?? responses[responses.length - 1] ?? "") };
}

describe("runScan", () => {
  it("returns a live result when the fetch and the model both succeed", async () => {
    const result = await runScan("acme.coffee", {
      inferencer: inferencerReturning(JSON.stringify(GOOD_PAYLOAD)),
      fetchImpl: vi.fn(async () => htmlResponse()) as unknown as typeof fetch,
    });

    expect(result.source).toBe("live");
    expect(result.host).toBe("acme.coffee");
    expect(result.profile.name).toBe("Acme Coffee");
    expect(ScanPayloadSchema.safeParse(result).success).toBe(true);
    expect(result.notes[0]).toBe("target acme.coffee");
  });

  it("strips a markdown fence around the JSON", async () => {
    const result = await runScan("acme.coffee", {
      inferencer: inferencerReturning("```json\n" + JSON.stringify(GOOD_PAYLOAD) + "\n```"),
      fetchImpl: vi.fn(async () => htmlResponse()) as unknown as typeof fetch,
    });
    expect(result.source).toBe("live");
  });

  it("downgrades to hostname-only when the fetch fails", async () => {
    const result = await runScan("unreachable.example", {
      inferencer: inferencerReturning(JSON.stringify(GOOD_PAYLOAD)),
      fetchImpl: vi.fn(async () => {
        throw new Error("ENOTFOUND");
      }) as unknown as typeof fetch,
    });

    expect(result.source).toBe("hostname-only");
    // The model cannot be trusted to name a company it never read.
    expect(result.profile.name).toBe("Unreachable");
    expect(result.notes.join(" ")).toContain("hostname alone");
    expect(result.agents.length).toBeGreaterThanOrEqual(3);
  });

  it("downgrades when the response is not html", async () => {
    const result = await runScan("acme.coffee", {
      inferencer: inferencerReturning(JSON.stringify(GOOD_PAYLOAD)),
      fetchImpl: vi.fn(
        async () => new Response("{}", { headers: { "content-type": "application/json" } }),
      ) as unknown as typeof fetch,
    });
    expect(result.source).toBe("hostname-only");
  });

  it("downgrades on a non-ok status", async () => {
    const result = await runScan("acme.coffee", {
      inferencer: inferencerReturning(JSON.stringify(GOOD_PAYLOAD)),
      fetchImpl: vi.fn(
        async () => new Response("nope", { status: 403, headers: { "content-type": "text/html" } }),
      ) as unknown as typeof fetch,
    });
    expect(result.source).toBe("hostname-only");
  });

  it("retries once with a repair instruction before giving up", async () => {
    const inferencer = inferencerReturning("not json at all", JSON.stringify(GOOD_PAYLOAD));

    const result = await runScan("acme.coffee", {
      inferencer,
      fetchImpl: vi.fn(async () => htmlResponse()) as unknown as typeof fetch,
    });

    expect(inferencer.complete).toHaveBeenCalledTimes(2);
    expect(result.source).toBe("live");
  });

  it("falls back when the model never returns valid JSON", async () => {
    const result = await runScan("acme.coffee", {
      inferencer: inferencerReturning("garbage", "still garbage"),
      fetchImpl: vi.fn(async () => htmlResponse()) as unknown as typeof fetch,
    });

    expect(result.source).toBe("fallback");
    expect(result.profile.name).toBe("Acme");
    expect(result.notes.join(" ")).toContain("sample roster");
    expect(ScanPayloadSchema.safeParse(result).success).toBe(true);
  });

  it("falls back when the model throws", async () => {
    const result = await runScan("acme.coffee", {
      inferencer: {
        complete: vi.fn(async () => {
          throw new Error("rate limited");
        }),
      },
      fetchImpl: vi.fn(async () => htmlResponse()) as unknown as typeof fetch,
    });
    expect(result.source).toBe("fallback");
  });

  it("falls back when no inferencer is configured at all", async () => {
    const result = await runScan("acme.coffee", {
      inferencer: null,
      fetchImpl: vi.fn(async () => htmlResponse()) as unknown as typeof fetch,
    });
    expect(result.source).toBe("fallback");
    expect(result.agents.length).toBeGreaterThanOrEqual(3);
  });

  it("never fetches for a plain description", async () => {
    const fetchImpl = vi.fn(async () => htmlResponse()) as unknown as typeof fetch;

    const result = await runScan("a coffee roaster with three cafes", {
      inferencer: inferencerReturning(JSON.stringify(GOOD_PAYLOAD)),
      fetchImpl,
    });

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result.host).toBeNull();
    expect(result.source).toBe("live");
  });

  it("always produces a drawable graph with exactly one root", async () => {
    const twoRoots = {
      ...GOOD_PAYLOAD,
      agents: GOOD_PAYLOAD.agents.map((a) => ({ ...a, reportsTo: null })),
    };

    const result = await runScan("acme.coffee", {
      inferencer: inferencerReturning(JSON.stringify(twoRoots)),
      fetchImpl: vi.fn(async () => htmlResponse()) as unknown as typeof fetch,
    });

    expect(result.agents.filter((a) => a.reportsTo === null)).toHaveLength(1);
  });
});
