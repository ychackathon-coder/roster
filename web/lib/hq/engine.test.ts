/**
 * HQ engine tests — run offline, no network, no model.
 *
 * The specificity gate is the product's proof point and its failure mode is
 * invisible (output still reads fine, it just stops proving anything), so it is
 * tested from both directions. Routing quality is pinned by the regressions
 * that actually happened.
 *
 * Run: npm test   (in web/)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { EventRow, TeamProfile } from "@/lib/contracts";
import { checkSpecificity, extractTraitAnchors, mostRelevantTrait } from "./specificity";
import { findMemoryMatch, similarity } from "./memory";
import {
  AGENT_CATALOG,
  buildAgentPrompt,
  decideHq,
  deterministicDecide,
  routeDeterministically,
} from "./engine";

const PROFILE: TeamProfile = {
  archetype: "Evidence-Led Maintainer",
  summary:
    "The chalk/chalk team ships small TypeScript changes with terse commit messages and a usage-first README.",
  traits: [
    'Recent commits include "Add support for WezTerm true-color detection" and "Fix Ghostty 24-bit check".',
    "Primary language is TypeScript; the public surface is a single index.d.ts with no runtime dependencies.",
    "README leads with a usage example before any install instructions.",
  ],
  directive:
    "Reuse an existing agent for small scoped asks; spawn a specialist only for surfaces absent from recent commits.",
  source_repo: "chalk/chalk",
};

const seededEvent = (over: Partial<EventRow>): EventRow => ({
  id: "evt-1",
  org_id: "org-1",
  team: "Sales",
  user: "alex",
  request: "Need an updated one-pager for the enterprise customer demo next week",
  decision: "route_existing",
  sub_agent: "Sales Agent",
  reasoning: "matched sales surface",
  terminal_line: "[HQ→Sales] routed",
  at: new Date(Date.now() - 4 * 86_400_000).toISOString(),
  ...over,
});

const SEEDED: EventRow[] = [
  seededEvent({}),
  seededEvent({
    id: "evt-2",
    team: "Ops",
    user: "jordan",
    request: "Onboard the new logistics vendor and share the checklist with the team",
    sub_agent: "Ops Agent",
    at: new Date(Date.now() - 6 * 86_400_000).toISOString(),
  }),
];

/* ------------------------------- specificity ------------------------------- */

test("anchors come from traits, never the archetype label", () => {
  const anchors = extractTraitAnchors(PROFILE);
  assert.ok(anchors.includes("chalk/chalk"));
  assert.ok(anchors.some((a) => a.includes("wezterm")));
  assert.ok(anchors.some((a) => a.includes("index.d.ts")));
  assert.ok(!anchors.includes("evidence-led maintainer"));
});

test("real citation passes; archetype-only and filler are rejected", () => {
  assert.ok(
    checkSpecificity(
      '[HQ→Sales] reuses Sales Agent — recent work is "Add support for WezTerm true-color detection".',
      PROFILE,
    ).ok,
  );
  assert.equal(
    checkSpecificity("[HQ→Sales] Evidence-Led Maintainer team — routing to Sales Agent.", PROFILE).ok,
    false,
  );
  assert.equal(
    checkSpecificity("[HQ→Sales] chalk/chalk is a well-maintained, collaborative codebase.", PROFILE).ok,
    false,
  );
});

test("the most relevant trait is chosen, not just the first", () => {
  assert.match(mostRelevantTrait(PROFILE, "is the README example still accurate?"), /README/);
  assert.match(mostRelevantTrait(PROFILE, "does TypeScript cover the index surface?"), /TypeScript/);
});

/* --------------------------------- memory ---------------------------------- */

test("the demo pair matches; unrelated requests do not", () => {
  const match = findMemoryMatch("Can we refresh the sales one-pager for the enterprise demo?", SEEDED);
  assert.ok(match, "one-pager request must match the seeded one-pager event");
  assert.equal(match.event.id, "evt-1");

  assert.equal(
    findMemoryMatch("rotate the TLS certificate on the staging load balancer", SEEDED),
    null,
  );
});

test("similarity is symmetric and stopwords cannot carry a match", () => {
  const a = similarity("refresh the sales one-pager", "sales one-pager needs a refresh");
  assert.ok(a.score > 0.5);
  assert.equal(
    similarity("we would like this with that from there", "they have been over there with this").score,
    0,
  );
});

/* --------------------------------- routing --------------------------------- */

test("a CI failure routes to Build Agent, not Sales", () => {
  // REGRESSION: first-match regexes once sent this to Sales via "pipeline".
  const r = routeDeterministically("The CI pipeline is failing on the release branch", "Engineering");
  assert.equal(r?.agent, "Build Agent");
});

test("the requesting team breaks keyword ties", () => {
  assert.equal(routeDeterministically("staging deploy before the demo", "Engineering")?.agent, "Build Agent");
  assert.equal(routeDeterministically("one-pager for the demo", "Sales")?.agent, "Sales Agent");
});

test("realistic requests spread across agents instead of piling on HQ", () => {
  const cases: [string, string, string][] = [
    ["Escalation from Northwind is still unresolved after two days", "Support", "Support Agent"],
    ["Reconcile the invoice exceptions from last month", "Operations", "Finance Agent"],
    ["Onboard the new logistics vendor and share the checklist", "Operations", "Ops Agent"],
    ["Refresh the enterprise one-pager before the demo", "Sales", "Sales Agent"],
    ["Review the staging deploy before we promote it", "Engineering", "Build Agent"],
  ];
  for (const [request, team, expected] of cases) {
    assert.equal(routeDeterministically(request, team)?.agent, expected, request);
  }
});

/* ---------------------------------- floor ---------------------------------- */

test("the deterministic floor ALWAYS passes the specificity gate", () => {
  for (const request of [
    "refresh the sales one-pager for the enterprise demo",
    "process the Q3 invoices",
    "what is our press kit policy",
    "asdf qwer zxcv",
    "",
  ]) {
    const out = deterministicDecide({
      profile: PROFILE,
      request,
      team: "Sales",
      user: null,
      recent_events: SEEDED,
    });
    const spec = checkSpecificity(`${out.terminal_line} ${out.reasoning}`, PROFILE);
    assert.ok(spec.ok, `floor failed specificity for "${request}": ${JSON.stringify(spec.findings)}`);
  }
});

test("unfamiliar long requests spawn a specialist; trivial ones go to HQ", () => {
  const spawn = deterministicDecide({
    profile: PROFILE,
    request: "We must arrange notarized apostille paperwork for the Berlin subsidiary",
    team: "Operations",
    user: null,
    recent_events: [],
  });
  assert.equal(spawn.decision, "spawn_new");
  assert.match(spawn.sub_agent, /Specialist/);

  const direct = deterministicDecide({
    profile: PROFILE,
    request: "status",
    team: "Sales",
    user: null,
    recent_events: [],
  });
  assert.equal(direct.decision, "handle_direct");
  assert.equal(direct.sub_agent, "HQ");
});

test("the floor cites the prior event when memory matches", () => {
  const out = deterministicDecide({
    profile: PROFILE,
    request: "Can we refresh the sales one-pager for the enterprise demo?",
    team: "Sales",
    user: null,
    recent_events: SEEDED,
  });
  assert.match(out.reasoning, /Close prior match/);
  assert.match(out.reasoning, /one-pager/);
});

/* --------------------------------- engine ---------------------------------- */

test("decideHq degrades to the floor with the model disabled", async () => {
  const saved = process.env.HQ_MODEL_ENABLED;
  process.env.HQ_MODEL_ENABLED = "false";
  try {
    const out = await decideHq({
      profile: PROFILE,
      request: "Can we refresh the sales one-pager for the enterprise demo?",
      team: "Sales",
      user: "alex",
      recent_events: SEEDED,
    });
    assert.equal(out.meta.source, "deterministic");
    assert.equal(out.meta.model_used, false);
    assert.ok(out.meta.specificity.ok);
    assert.equal(out.meta.memory_match?.id, "evt-1");
  } finally {
    if (saved === undefined) delete process.env.HQ_MODEL_ENABLED;
    else process.env.HQ_MODEL_ENABLED = saved;
  }
});

test("agent prompts carry the task, the persona, and the team's directive", () => {
  const prompt = buildAgentPrompt({
    request: "add a CONTRIBUTING.md",
    subAgent: "Build Agent",
    team: "Engineering",
    profile: PROFILE,
  });
  assert.match(prompt, /Build Agent/);
  assert.match(prompt, /add a CONTRIBUTING\.md/);
  assert.match(prompt, /chalk\/chalk/);
  assert.match(prompt, /REPORT\.md/);
});

test("the agent catalog is uniquely named", () => {
  const names = AGENT_CATALOG.map((a) => a.name);
  assert.equal(new Set(names).size, names.length);
});
