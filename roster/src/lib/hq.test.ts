/**
 * HQ engine tests.
 *
 * Run: npm test   (in roster/)
 *
 * The specificity gate is the demo's entire proof point, and its failure mode is
 * invisible — the response still reads fine, it just stops proving anything. So
 * it is tested from both directions: real citations must pass, and generic output
 * must be rejected.
 *
 * No network: every test either avoids the model path or relies on the
 * deterministic floor, so this suite runs offline and in CI.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  checkSpecificity,
  extractTraitAnchors,
  mostRelevantTrait,
  condenseTrait,
} from "./specificity";
import { findMemoryMatch, similarity, recentEvents, describeAge } from "./memory";
import { deterministicDecide, decideHq, toEvent, AGENT_CATALOG, routeDeterministically } from "./hq";
import { SEEDED_EVENTS, DEMO_MEMORY_REQUEST } from "./seed-data";
import type { TeamProfile } from "./types";

/** Shaped like a real derived profile — traits quote commits and name files. */
const PROFILE: TeamProfile = {
  archetype: "Evidence-Led Maintainer",
  summary:
    "The chalk/chalk team ships small, well-scoped TypeScript changes with terse commit messages and a README organised around usage examples.",
  traits: [
    'Recent commits include "Add support for WezTerm true-color detection" and "Fix Ghostty 24-bit check" — terminal capability work dominates.',
    "Primary language is TypeScript; the public surface is a single index.d.ts with no runtime dependencies.",
    "README leads with a usage example before any install instructions.",
  ],
  directive:
    "Prefer reusing an existing agent for small scoped asks; spawn a specialist only when the request names a surface absent from recent commits.",
  source_repo: "chalk/chalk",
};

/* ------------------------------- specificity ------------------------------- */

test("anchors are extracted from traits, not from the archetype", () => {
  const anchors = extractTraitAnchors(PROFILE);
  assert.ok(anchors.includes("chalk/chalk"), "repo name is a checkable detail");
  assert.ok(
    anchors.some((a) => a.includes("wezterm")),
    "a quoted commit fragment must become an anchor",
  );
  assert.ok(anchors.some((a) => a.includes("index.d.ts")), "filenames are anchors");
  assert.ok(anchors.includes("typescript"));
  // The archetype label must NOT count as a citation — restating it is the exact
  // failure the handover calls out.
  assert.ok(!anchors.includes("evidence-led maintainer"));
});

test("a response citing a real commit fragment passes", () => {
  const r = checkSpecificity(
    '[HQ→Sales] route existing → Sales Agent · recent work is terminal capability ("Add support for WezTerm true-color detection"), so this collateral ask reuses Sales Agent.',
    PROFILE,
  );
  assert.ok(r.ok, `expected pass, got ${JSON.stringify(r.findings)}`);
  assert.ok(r.matched.length > 0);
});

test("a response that only restates the archetype is REJECTED", () => {
  const r = checkSpecificity(
    "[HQ→Sales] Evidence-Led Maintainer team — routing to Sales Agent.",
    PROFILE,
  );
  assert.equal(r.ok, false);
  assert.ok(
    r.findings.some((f) => f.code === "no_trait_citation" || f.code === "archetype_only"),
    `expected an archetype-only finding, got ${JSON.stringify(r.findings)}`,
  );
});

test("generic filler is rejected even when a real detail is present", () => {
  const r = checkSpecificity(
    "[HQ→Sales] chalk/chalk is a well-maintained, collaborative codebase — routing to Sales Agent.",
    PROFILE,
  );
  assert.equal(r.ok, false);
  const codes = r.findings.map((f) => f.code);
  assert.ok(codes.includes("generic_filler"));
});

test("empty and vague responses are rejected", () => {
  for (const text of [
    "[HQ→Sales] Routing to Sales Agent.",
    "[HQ→Sales] Based on your profile, spawning a new agent.",
    "",
  ]) {
    assert.equal(checkSpecificity(text, PROFILE).ok, false, `should reject: ${text}`);
  }
});

test("the most relevant trait is chosen, not just the first", () => {
  const trait = mostRelevantTrait(PROFILE, "is the README example still accurate?");
  assert.match(trait, /README/);
  const other = mostRelevantTrait(PROFILE, "does TypeScript typing cover the index surface?");
  assert.match(other, /TypeScript/);
});

test("condenseTrait cuts on a word boundary", () => {
  const out = condenseTrait(PROFILE.traits[0]!, 40);
  assert.ok(out.length <= 41, `got ${out.length}`);
  assert.ok(out.endsWith("…"));
  assert.ok(!/\s…$/.test(out), "should not leave a dangling space before the ellipsis");
});

/* --------------------------------- memory --------------------------------- */

test("the intended demo pair matches — this is the memory beat", () => {
  // seed-data.ts states DEMO_MEMORY_REQUEST should match evt-seed-sales-onepager.
  // If this fails, the demo's "we've seen this before" moment silently stops
  // happening.
  const match = findMemoryMatch(DEMO_MEMORY_REQUEST, SEEDED_EVENTS);
  assert.ok(match, "the seeded one-pager event must match the live demo request");
  assert.equal(match.event.id, "evt-seed-sales-onepager");
  assert.ok(
    match.sharedTerms.includes("pager") || match.sharedTerms.some((t) => t.includes("pager")),
    `expected a shared 'one-pager' term, got ${JSON.stringify(match.sharedTerms)}`,
  );
});

test("an unrelated request does not match", () => {
  const match = findMemoryMatch(
    "rotate the TLS certificate on the staging load balancer",
    SEEDED_EVENTS,
  );
  assert.equal(match, null);
});

test("similarity is symmetric and reports the shared terms", () => {
  const a = similarity("refresh the sales one-pager", "sales one-pager needs a refresh");
  const b = similarity("sales one-pager needs a refresh", "refresh the sales one-pager");
  assert.equal(a.score, b.score);
  assert.ok(a.score > 0.5);
  assert.ok(a.shared.includes("sales"));
});

test("stopwords cannot carry a match on their own", () => {
  const { score } = similarity(
    "we would like this with that from there",
    "they have been over there with this",
  );
  assert.equal(score, 0, "common words must not produce a phantom memory match");
});

test("recentEvents sorts newest first and caps", () => {
  const sorted = recentEvents(SEEDED_EVENTS, 1);
  assert.equal(sorted.length, 1);
  assert.equal(sorted[0]!.id, "evt-seed-sales-onepager", "4 days ago beats 6 days ago");
});

test("describeAge is human readable", () => {
  assert.match(describeAge(new Date(Date.now() - 2 * 86_400_000).toISOString()), /2 days ago/);
  assert.match(describeAge(new Date(Date.now() - 3 * 3_600_000).toISOString()), /3 hours ago/);
  assert.match(describeAge(new Date().toISOString()), /earlier today/);
});

/* -------------------------- the deterministic floor ------------------------ */

test("the deterministic floor ALWAYS passes the specificity gate", () => {
  // This is the guarantee the whole design rests on: with no API key, or after
  // the model fails twice, the output still cites something real.
  const requests = [
    "refresh the sales one-pager for the enterprise demo",
    "process the Q3 invoices",
    "onboard the new logistics vendor",
    "what is our press kit policy",
    "asdf qwer zxcv",
    "",
  ];
  for (const request of requests) {
    const out = deterministicDecide({
      profile: PROFILE,
      request,
      team: "Sales",
      user: null,
      recent_events: SEEDED_EVENTS,
    });
    const spec = checkSpecificity(`${out.terminal_line} ${out.reasoning}`, PROFILE);
    assert.ok(
      spec.ok,
      `floor failed specificity for "${request}": ${JSON.stringify(spec.findings)}`,
    );
    assert.ok(out.terminal_line.startsWith("[HQ→Sales]"));
    assert.ok(["route_existing", "spawn_new", "handle_direct"].includes(out.decision));
  }
});

test("the floor cites the prior event when memory matches", () => {
  const out = deterministicDecide({
    profile: PROFILE,
    request: DEMO_MEMORY_REQUEST,
    team: "Sales",
    user: null,
    recent_events: SEEDED_EVENTS,
  });
  assert.match(out.reasoning, /Close prior match/);
  assert.match(out.reasoning, /one-pager/);
});

test("the floor says so plainly when there is no memory match", () => {
  const out = deterministicDecide({
    profile: PROFILE,
    request: "rotate the TLS certificate on staging",
    team: "Ops",
    user: null,
    recent_events: SEEDED_EVENTS,
  });
  assert.match(out.reasoning, /No prior event resembles/);
});

test("a profile with no traits still produces a usable line", () => {
  const thin: TeamProfile = {
    archetype: "Unknown",
    summary: "No summary",
    traits: [],
    directive: "Reuse agents.",
    source_repo: "acme/widget",
  };
  const out = deterministicDecide({
    profile: thin,
    request: "process invoices",
    team: "Finance",
    user: null,
    recent_events: [],
  });
  // source_repo is still a real anchor, so the gate holds.
  assert.ok(checkSpecificity(`${out.terminal_line} ${out.reasoning}`, thin).ok);
});

/* --------------------------------- engine --------------------------------- */

test("decideHq falls back deterministically with no API key", async () => {
  const saved = { hq: process.env.HQ_API_KEY, nv: process.env.NVIDIA_API_KEY };
  delete process.env.HQ_API_KEY;
  delete process.env.NVIDIA_API_KEY;
  try {
    const out = await decideHq({
      profile: PROFILE,
      request: DEMO_MEMORY_REQUEST,
      team: "Sales",
      user: null,
      recent_events: SEEDED_EVENTS,
    });
    assert.equal(out.meta.source, "deterministic");
    assert.equal(out.meta.model_used, false);
    assert.ok(out.meta.specificity.ok, "the floor must satisfy the gate");
    assert.ok(out.meta.memory_match, "memory should still be found without a model");
    assert.equal(out.meta.memory_match?.id, "evt-seed-sales-onepager");
  } finally {
    if (saved.hq !== undefined) process.env.HQ_API_KEY = saved.hq;
    if (saved.nv !== undefined) process.env.NVIDIA_API_KEY = saved.nv;
  }
});

test("toEvent produces a row matching the events table", () => {
  const event = toEvent({
    id: "evt-test",
    team: "Sales",
    user: "ansh",
    request: "refresh the one-pager",
    hq: {
      decision: "route_existing",
      sub_agent: "Sales Agent",
      reasoning: "because chalk/chalk",
      terminal_line: "[HQ→Sales] chalk/chalk",
    },
  });
  assert.deepEqual(Object.keys(event).sort(), [
    "decision", "id", "reasoning", "request", "sub_agent", "team",
    "terminal_line", "timestamp", "user",
  ]);
  assert.ok(!Number.isNaN(Date.parse(event.timestamp)));
});

test("the agent catalog is non-empty and uniquely named", () => {
  const names = AGENT_CATALOG.map((a) => a.name);
  assert.ok(names.length >= 3);
  assert.equal(new Set(names).size, names.length);
});

/* ------------------------------ routing quality ---------------------------- */

test("routing does not send a CI failure to Sales", () => {
  // REGRESSION: the inherited first-match regex chain matched "pipeline" against
  // the sales pattern, so "The CI pipeline is failing" routed to Sales Agent.
  const r = routeDeterministically("The CI pipeline is failing on the release branch", "Engineering");
  assert.equal(r?.agent, "Build Agent");
});

test("the requesting team breaks keyword ties", () => {
  // "demo" is a sales term; from Engineering the engineering terms should win.
  const eng = routeDeterministically("staging deploy before the demo", "Engineering");
  assert.equal(eng?.agent, "Build Agent");
  const sales = routeDeterministically("one-pager for the demo", "Sales");
  assert.equal(sales?.agent, "Sales Agent");
});

test("realistic requests route to sensible agents, not all to HQ", () => {
  // The whole point: 8 of 14 realistic requests previously fell through to
  // handle_direct, leaving one node doing everything and a dead org chart.
  const cases: [string, string, string][] = [
    ["Escalation from Northwind is still unresolved after two days", "Support", "Support Agent"],
    ["Reconcile the invoice exceptions from last month", "Operations", "Finance Agent"],
    ["Onboard the new logistics vendor and share the checklist", "Operations", "Ops Agent"],
    ["Refresh the enterprise one-pager before the demo", "Sales", "Sales Agent"],
    ["Review the staging deploy before we promote it", "Engineering", "Build Agent"],
    ["Check whether we are over budget on cloud spend", "Operations", "Finance Agent"],
  ];
  for (const [request, team, expected] of cases) {
    const r = routeDeterministically(request, team);
    assert.equal(r?.agent, expected, `"${request}" -> ${r?.agent ?? "null"}, expected ${expected}`);
  }
});

test("an unfamiliar surface spawns a specialist instead of defaulting to HQ", () => {
  const out = deterministicDecide({
    profile: PROFILE,
    request: "We need a trademark filing reviewed before the launch announcement",
    team: "Operations",
    user: null,
    recent_events: [],
  });
  assert.equal(out.decision, "spawn_new");
  assert.match(out.sub_agent, /Specialist/);
});

test("a trivially short request is handled directly", () => {
  const out = deterministicDecide({
    profile: PROFILE,
    request: "status",
    team: "Sales",
    user: null,
    recent_events: [],
  });
  assert.equal(out.decision, "handle_direct");
  assert.equal(out.sub_agent, "HQ");
});
