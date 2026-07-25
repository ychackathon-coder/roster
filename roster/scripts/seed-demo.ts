/**
 * Drive realistic requests through HQ so the dashboard has a company to show.
 *
 *   npm run seed:demo               # against http://127.0.0.1:3456
 *   npm run seed:demo -- <base-url>
 *
 * WHY THIS EXISTS: the events table only holds the 2 historical rows plus
 * whatever anyone happened to type. A dashboard built to render 18 agents across
 * 4 departments looks broken with 3 events in it. This routes a spread of real
 * requests through the real engine — nothing is faked, HQ makes every decision —
 * so the hierarchy, operations table, activity feed, and metrics all have
 * something true to display.
 *
 * Run AFTER onboarding, because HQ needs an active team profile.
 * Run `npm run seed` first if you want to clear accumulated rehearsal events.
 */

const base = (process.argv[2] ?? process.env.SB_ROSTER_URL ?? "http://127.0.0.1:3456").replace(
  /\/$/,
  "",
);

/** Spread across the four departments the hierarchy renders. */
const REQUESTS: { request: string; team: string; user: string }[] = [
  // Sales
  { request: "Refresh the enterprise one-pager before Thursday's demo", team: "Sales", user: "alex" },
  { request: "Pull together a competitor comparison for the Acme deal", team: "Sales", user: "alex" },
  { request: "Draft a renewal risk summary for the top ten accounts", team: "Sales", user: "priya" },

  // Support
  { request: "Escalation from Northwind is still unresolved after two days", team: "Support", user: "jordan" },
  { request: "Update the troubleshooting guide for the new auth flow", team: "Support", user: "jordan" },
  { request: "Summarise this week's ticket themes for the standup", team: "Support", user: "sam" },

  // Operations / Finance
  { request: "Reconcile the invoice exceptions from last month", team: "Operations", user: "dana" },
  { request: "Onboard the new logistics vendor and share the checklist", team: "Operations", user: "dana" },
  { request: "Check whether we are over budget on cloud spend", team: "Operations", user: "priya" },

  // Engineering
  { request: "The CI pipeline is failing on the release branch", team: "Engineering", user: "ansh" },
  { request: "Review the staging deploy before we promote it", team: "Engineering", user: "ansh" },
  { request: "Update the release notes for version 4.18", team: "Engineering", user: "sam" },

  // Deliberately unlike anything above, to exercise spawn_new.
  { request: "We need a trademark filing reviewed before the launch announcement", team: "Operations", user: "dana" },

  // Deliberately close to the seeded history, to exercise the memory callback.
  { request: "Can we refresh the sales one-pager for the enterprise demo?", team: "Sales", user: "alex" },
];

type HqResponse = {
  decision?: string;
  sub_agent?: string;
  terminal_line?: string;
  error?: string;
  meta?: { source?: string; specificity?: { ok?: boolean }; memory_match?: { id?: string } | null };
};

async function main() {
  // Fail fast and clearly if onboarding hasn't run — HQ cannot decide without a
  // profile, and 14 identical 400s is a confusing way to find that out.
  const profileRes = await fetch(`${base}/api/profile`).catch(() => null);
  if (!profileRes?.ok) {
    console.error(`Cannot reach roster at ${base}. Start it with: npm run dev`);
    process.exit(1);
  }
  const { profile } = (await profileRes.json()) as { profile: unknown };
  if (!profile) {
    console.error(
      "No active team profile. Open the onboarding page and index a repo first,\n" +
        "or: curl -X POST " + base + "/api/index-repo -H 'Content-Type: application/json' -d '{\"repo\":\"chalk/chalk\"}'",
    );
    process.exit(1);
  }

  console.log(`Routing ${REQUESTS.length} requests through HQ at ${base}\n`);

  let ok = 0;
  let failed = 0;
  const bySubAgent = new Map<string, number>();
  const byDecision = new Map<string, number>();
  let specificityFailures = 0;

  for (const [i, item] of REQUESTS.entries()) {
    const label = `${String(i + 1).padStart(2, " ")}/${REQUESTS.length}`;
    try {
      const res = await fetch(`${base}/api/hq`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item),
      });
      const body = (await res.json()) as HqResponse;

      if (!res.ok || body.error) {
        failed++;
        console.log(`${label} ✖ ${item.team.padEnd(12)} ${body.error ?? res.status}`);
        continue;
      }

      ok++;
      bySubAgent.set(body.sub_agent ?? "?", (bySubAgent.get(body.sub_agent ?? "?") ?? 0) + 1);
      byDecision.set(body.decision ?? "?", (byDecision.get(body.decision ?? "?") ?? 0) + 1);
      if (body.meta?.specificity?.ok === false) specificityFailures++;

      const memory = body.meta?.memory_match ? " ⟲memory" : "";
      console.log(
        `${label} ✔ ${item.team.padEnd(12)} ${(body.sub_agent ?? "?").padEnd(18)} ${body.decision}${memory}`,
      );
    } catch (err) {
      failed++;
      console.log(`${label} ✖ ${item.team.padEnd(12)} ${(err as Error).message}`);
    }
  }

  console.log(`\n${ok} routed, ${failed} failed`);
  console.log("\nagents now on the board:");
  for (const [agent, n] of [...bySubAgent.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(2)}  ${agent}`);
  }
  console.log("\ndecisions:");
  for (const [decision, n] of byDecision) console.log(`  ${String(n).padStart(2)}  ${decision}`);

  if (specificityFailures > 0) {
    console.log(
      `\n⚠ ${specificityFailures} response(s) failed the specificity gate — they were replaced by\n` +
        `  the deterministic floor, which is correct, but worth knowing before the demo.`,
    );
  }
  console.log(`\nOpen the dashboard to see it: http://localhost:3001`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
