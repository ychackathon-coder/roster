import { describe, expect, it } from "vitest";

import { fallbackPayload, titleFromHost } from "@/lib/scan/fallback";
import { depthOf, normalizeGraph } from "@/lib/scan/normalizeGraph";
import { ScanPayloadSchema, type Agent } from "@/lib/types";

const VALID = {
  profile: {
    name: "Acme",
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

describe("ScanPayloadSchema", () => {
  it("accepts a well-formed payload", () => {
    expect(ScanPayloadSchema.safeParse(VALID).success).toBe(true);
  });

  it("rejects a payload with too few agents", () => {
    const partial = { ...VALID, agents: VALID.agents.slice(0, 2) };
    expect(ScanPayloadSchema.safeParse(partial).success).toBe(false);
  });

  it("rejects a payload missing profile fields", () => {
    const broken = { ...VALID, profile: { name: "Acme" } };
    expect(ScanPayloadSchema.safeParse(broken).success).toBe(false);
  });

  it("rejects an agent with no tools", () => {
    const broken = {
      ...VALID,
      agents: [{ ...VALID.agents[0], tools: [] }, ...VALID.agents.slice(1)],
    };
    expect(ScanPayloadSchema.safeParse(broken).success).toBe(false);
  });

  it("rejects a non-object", () => {
    expect(ScanPayloadSchema.safeParse("nope").success).toBe(false);
  });
});

describe("normalizeGraph", () => {
  const agent = (role: string, reportsTo: string | null): Agent => ({
    role,
    mandate: "Does the thing it is meant to do.",
    tools: ["Slack"],
    reportsTo,
  });

  it("keeps a single root and valid edges untouched", () => {
    const input = [agent("A", null), agent("B", "A"), agent("C", "B")];
    expect(normalizeGraph(input)).toEqual(input);
  });

  it("collapses multiple roots down to the first one", () => {
    const result = normalizeGraph([agent("A", null), agent("B", null), agent("C", "A")]);
    expect(result.filter((a) => a.reportsTo === null)).toHaveLength(1);
    expect(result[1]!.reportsTo).toBe("A");
  });

  it("re-parents an edge pointing at an agent that does not exist", () => {
    const result = normalizeGraph([agent("A", null), agent("B", "Ghost")]);
    expect(result[1]!.reportsTo).toBe("A");
  });

  it("promotes the first agent when nobody declared a root", () => {
    const result = normalizeGraph([agent("A", "B"), agent("B", "A")]);
    expect(result[0]!.reportsTo).toBeNull();
    expect(result[1]!.reportsTo).toBe("A");
  });

  it("breaks a cycle that never reaches the root", () => {
    const result = normalizeGraph([
      agent("A", null),
      agent("B", "C"),
      agent("C", "B"),
    ]);
    const parents = new Map(result.map((a) => [a.role, a.reportsTo]));
    // Walking up from every node must terminate at the root.
    for (const role of ["B", "C"]) {
      let cursor = parents.get(role) ?? null;
      let steps = 0;
      while (cursor !== null && steps < 10) {
        cursor = parents.get(cursor) ?? null;
        steps += 1;
      }
      expect(steps).toBeLessThan(10);
    }
  });

  it("rejects an agent reporting to itself", () => {
    const result = normalizeGraph([agent("A", null), agent("B", "B")]);
    expect(result[1]!.reportsTo).toBe("A");
  });

  it("drops duplicate roles so edges stay unambiguous", () => {
    const result = normalizeGraph([agent("A", null), agent("B", "A"), agent("B", "A")]);
    expect(result).toHaveLength(2);
  });

  it("returns an empty list unchanged", () => {
    expect(normalizeGraph([])).toEqual([]);
  });
});

describe("depthOf", () => {
  it("measures distance from the root", () => {
    const depths = depthOf([
      { role: "A", mandate: "m", tools: ["t"], reportsTo: null },
      { role: "B", mandate: "m", tools: ["t"], reportsTo: "A" },
      { role: "C", mandate: "m", tools: ["t"], reportsTo: "B" },
    ]);
    expect(depths.get("A")).toBe(0);
    expect(depths.get("B")).toBe(1);
    expect(depths.get("C")).toBe(2);
  });
});

describe("fallback", () => {
  it("is itself a valid payload", () => {
    expect(ScanPayloadSchema.safeParse(fallbackPayload({ host: null, text: null })).success).toBe(
      true,
    );
  });

  it("personalises the name from a hostname", () => {
    expect(fallbackPayload({ host: "acme-tools.co.uk", text: null }).profile.name).toBe(
      "Acme Tools",
    );
  });

  it("personalises the name from a description", () => {
    expect(fallbackPayload({ host: null, text: "Blue Bottle Coffee roasts beans" }).profile.name).toBe(
      "Blue Bottle Coffee",
    );
  });

  it("title cases a plain host", () => {
    expect(titleFromHost("www.stripe.com")).toBe("Stripe");
  });

  it("has a drawable graph", () => {
    const payload = fallbackPayload({ host: null, text: null });
    expect(normalizeGraph(payload.agents)).toEqual(payload.agents);
  });
});
