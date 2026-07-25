import type { RosterEvent } from "./types";

/**
 * Two seeded historical events (§4.3).
 * Event 1 is designed to closely resemble the live demo memory-callback request:
 *   live type: "Can we refresh the sales one-pager for the enterprise demo?"
 */
export const SEEDED_EVENTS: RosterEvent[] = [
  {
    id: "evt-seed-sales-onepager",
    team: "Sales",
    user: "alex",
    request: "Need an updated one-pager for the enterprise customer demo next week",
    decision: "route_existing",
    sub_agent: "Sales Agent",
    reasoning:
      "Matches Sales surface area; reused Sales Agent per Fast Iterator preference for small handoffs.",
    terminal_line:
      "[HQ→Sales] Routed to Sales Agent — enterprise one-pager refresh (similar to prior collateral asks).",
    timestamp: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "evt-seed-ops-vendor",
    team: "Ops",
    user: "jordan",
    request: "Onboard the new logistics vendor and share the checklist with the team",
    decision: "route_existing",
    sub_agent: "Ops Agent",
    reasoning: "Vendor onboarding is an Ops runbook; no new agent required.",
    terminal_line:
      "[HQ→Ops] Routed to Ops Agent — logistics vendor onboarding checklist.",
    timestamp: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(),
  },
];

/** Live demo request that should memory-match evt-seed-sales-onepager */
export const DEMO_MEMORY_REQUEST =
  "Can we refresh the sales one-pager for the enterprise demo?";
