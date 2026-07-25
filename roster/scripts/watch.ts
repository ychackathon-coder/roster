/**
 * Live view of the shared event stream. Run in its own terminal to watch requests
 * arrive from every other terminal and from the dashboard.
 *
 *   npm run watch
 *
 * This is the same data the dashboard polls, so if a line shows up here and not
 * on screen, the problem is the dashboard, not the backend.
 */
const base = (process.env.SB_ROSTER_URL ?? "http://127.0.0.1:3456").replace(/\/$/, "");

const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;

type EventRow = {
  id: string;
  team: string;
  user: string | null;
  request: string;
  decision: string;
  sub_agent: string;
  timestamp: string;
};

const seen = new Set<string>();
let first = true;

async function poll(): Promise<void> {
  try {
    const res = await fetch(`${base}/api/events`);
    if (!res.ok) return;
    const body = (await res.json()) as EventRow[] | { events?: EventRow[] };
    const list = Array.isArray(body) ? body : (body.events ?? []);

    // Oldest first so the feed reads top-to-bottom like a log.
    const ordered = [...list].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));

    for (const e of ordered) {
      if (seen.has(e.id)) continue;
      seen.add(e.id);
      // On the first pass just record what's already there — replaying the whole
      // table on startup would bury the live lines you actually want to see.
      if (first) continue;

      const who = e.user ? `${e.user}` : "someone";
      const time = new Date(e.timestamp).toLocaleTimeString();
      const arrow = e.decision === "spawn_new" ? yellow("⇒ SPAWNED") : green("→");
      console.log(
        `${dim(time)}  ${cyan(who.padEnd(9))} ${dim(e.team.padEnd(12))} ${arrow} ${bold(e.sub_agent)}`,
      );
      console.log(`           ${dim(e.request)}`);
    }

    if (first) {
      console.log(dim(`  (${seen.size} existing events — watching for new ones)\n`));
      first = false;
    }
  } catch {
    /* roster restarting — keep polling */
  }
}

async function main() {
  console.log("");
  console.log(bold("Watching the company event stream") + dim(`  ${base}`));
  console.log(dim("Ctrl-C to quit.\n"));
  await poll();
  setInterval(() => void poll(), 2000);
}

main();

// Marks this file a module so its top-level names do not collide with other
// scripts in this directory (TS treats import-less files as global scripts).
export {};
