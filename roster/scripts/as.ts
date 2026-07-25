/**
 * Act as one person at a terminal. Run one per terminal window to simulate
 * several teammates using the company at once, on a single computer.
 *
 *   npm run as -- Jordan Support
 *   npm run as -- Ansh Engineering
 *
 * Type a request in plain English, press enter, see HQ's decision. Every request
 * lands in the shared event stream, so the dashboard and every other terminal see
 * it within a few seconds.
 */
import readline from "node:readline";

const [name = "Someone", team = "Sales"] = process.argv.slice(2);
const base = (process.env.SB_ROSTER_URL ?? "http://127.0.0.1:3456").replace(/\/$/, "");

const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;

async function send(request: string): Promise<void> {
  try {
    const res = await fetch(`${base}/api/hq`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ request, team, user: name.toLowerCase() }),
    });
    const body = (await res.json()) as {
      decision?: string;
      sub_agent?: string;
      terminal_line?: string;
      error?: string;
      meta?: { memory_match?: { request?: string } | null; source?: string };
    };

    if (body.error) {
      console.log(yellow(`  ✖ ${body.error}`));
      return;
    }

    console.log(green(`  → ${body.sub_agent}  ${dim(`(${body.decision})`)}`));
    if (body.terminal_line) console.log(dim(`  ${body.terminal_line}`));
    if (body.meta?.memory_match?.request) {
      console.log(yellow(`  ⟲ seen before: "${body.meta.memory_match.request}"`));
    }
  } catch (err) {
    console.log(yellow(`  ✖ cannot reach roster at ${base} — is ./start.sh running?`));
    void err;
  }
}

async function main() {
  const profileRes = await fetch(`${base}/api/profile`).catch(() => null);
  if (!profileRes?.ok) {
    console.log(yellow(`Cannot reach roster at ${base}. Run ./start.sh first.`));
    process.exit(1);
  }
  const { profile } = (await profileRes.json()) as { profile: { source_repo?: string } | null };
  if (!profile) {
    console.log(yellow("No company yet — index a repo at http://localhost:3456 first."));
    process.exit(1);
  }

  console.log("");
  console.log(`${bold(name)} ${dim(`· ${team} · company calibrated on ${profile.source_repo}`)}`);
  console.log(dim("Type a request and press enter. Ctrl-C to quit.\n"));

  /**
   * One-shot when a request is passed as arguments or piped in; interactive
   * otherwise.
   *
   * The non-interactive path is handled separately on purpose: with piped input,
   * readline's "close" fires the instant stdin ends, which happens before an
   * in-flight fetch resolves — so the request is sent and the process exits
   * before the answer arrives, and nothing is printed.
   */
  const inlineRequest = process.argv.slice(4).join(" ").trim();
  if (inlineRequest) {
    await send(inlineRequest);
    console.log("");
    return;
  }

  /**
   * One readline loop for both a real terminal and a pipe.
   *
   * The earlier version buffered ALL of stdin before processing anything, which
   * only works when input ends. Over a pipe — which is what plenty of terminal
   * setups and IDE consoles actually give you — the process would accept a
   * request and sit there doing nothing, looking dead while still running.
   *
   * Requests are also serialised through a promise chain: readline delivers lines
   * as fast as they arrive, and two overlapping sends would interleave their
   * output into an unreadable mess.
   */
  const interactive = Boolean(process.stdin.isTTY);
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: interactive,
  });

  if (interactive) {
    rl.setPrompt(`${name}> `);
    rl.prompt();
  }

  let chain: Promise<void> = Promise.resolve();

  rl.on("line", (line) => {
    const text = line.trim();
    if (!text) {
      if (interactive) rl.prompt();
      return;
    }
    chain = chain.then(async () => {
      if (!interactive) console.log(`${name}> ${text}`);
      await send(text);
      console.log("");
      if (interactive) rl.prompt();
    });
  });

  // Wait for queued work before exiting, or a request sent just before stdin
  // closed would be dropped silently.
  rl.on("close", () => {
    void chain.then(() => {
      if (interactive) console.log(dim("\nbye\n"));
      process.exit(0);
    });
  });
}

main();
