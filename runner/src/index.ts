#!/usr/bin/env tsx
/**
 * roster-runner — executes Roster tasks with REAL Claude Code sessions.
 *
 *   roster-runner start --hub https://your-app.vercel.app --token rt_... --repo ~/work/my-product
 *
 * The runner polls the hub for queued tasks in its org, spawns the user's own
 * `claude` CLI inside the repo it was pointed at, parses the session's
 * stream-json output for real actions (file edits, commands), and streams them
 * up — so the dashboard shows what the agent is actually doing, not a label.
 *
 * Config precedence: flags > env (ROSTER_HUB / ROSTER_TOKEN / ROSTER_REPO) >
 * ~/.roster-runner.json. Nothing is written anywhere except that config file
 * (with --save) and whatever the agent session itself edits in the target repo.
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import readline from "node:readline";

type Config = {
  hub: string;
  token: string;
  repo: string;
  pollSeconds: number;
  maxTurns: number;
  taskTimeoutMinutes: number;
  permissionMode: string;
};

const CONFIG_PATH = path.join(homedir(), ".roster-runner.json");

const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;

function loadConfig(): Config {
  const argv = process.argv.slice(2);
  const flag = (name: string): string | undefined => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  let file: Partial<Config> = {};
  try {
    if (existsSync(CONFIG_PATH)) file = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
  } catch {
    console.log(yellow(`ignoring unreadable ${CONFIG_PATH}`));
  }

  const cfg: Config = {
    hub: (flag("hub") ?? process.env.ROSTER_HUB ?? file.hub ?? "http://127.0.0.1:3000").replace(/\/$/, ""),
    token: flag("token") ?? process.env.ROSTER_TOKEN ?? file.token ?? "",
    repo: path.resolve(flag("repo") ?? process.env.ROSTER_REPO ?? file.repo ?? process.cwd()),
    pollSeconds: Number(flag("poll") ?? file.pollSeconds ?? 5),
    maxTurns: Number(flag("max-turns") ?? file.maxTurns ?? 30),
    taskTimeoutMinutes: Number(flag("timeout") ?? file.taskTimeoutMinutes ?? 15),
    // acceptEdits: the agent can edit files in the repo you pointed it at, but
    // anything beyond that still follows Claude Code's own permission rules.
    permissionMode: flag("permission-mode") ?? file.permissionMode ?? "acceptEdits",
  };

  if (argv.includes("--save")) {
    writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2) + "\n");
    console.log(dim(`saved config to ${CONFIG_PATH}`));
  }
  return cfg;
}

/* --------------------------------- hub api --------------------------------- */

async function hub<T>(cfg: Config, method: string, pathName: string, body?: unknown): Promise<T | null> {
  try {
    const res = await fetch(`${cfg.hub}${pathName}`, {
      method,
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(15_000),
    });
    if (res.status === 401) {
      console.log(red("hub rejected the runner token (401) — check --token"));
      process.exit(1);
    }
    if (!res.ok) {
      console.log(yellow(`hub ${pathName} -> ${res.status}`));
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    console.log(yellow(`hub unreachable (${(err as Error).message}) — retrying`));
    return null;
  }
}

type NextTask = {
  task: {
    id: string;
    request: string;
    sub_agent: string;
    prompt: string;
    team: string;
  } | null;
};

/* ----------------------------- claude session ------------------------------ */

type StreamEvent = {
  type: string;
  subtype?: string;
  result?: string;
  message?: { content?: Array<{ type: string; name?: string; text?: string; input?: Record<string, unknown> }> };
};

/**
 * Run one real Claude Code session for a task and stream its actions up.
 *
 * stream-json gives us every assistant turn as NDJSON; tool_use blocks are the
 * agent's real actions. No hooks to install, nothing added to the target repo.
 */
async function runTask(cfg: Config, task: NonNullable<NextTask["task"]>): Promise<void> {
  console.log("");
  console.log(`${bold(task.sub_agent)} ${dim("starts:")} ${task.request}`);

  const report = (activity: Record<string, unknown>, terminal_line?: string) =>
    hub(cfg, "POST", `/api/runner/tasks/${task.id}/activity`, { activity, terminal_line });

  await report(
    { kind: "session_start" },
    `[${task.sub_agent}] session started in ${path.basename(cfg.repo)}/`,
  );

  const args = [
    "-p",
    task.prompt,
    "--output-format",
    "stream-json",
    "--verbose",
    "--max-turns",
    String(cfg.maxTurns),
    "--permission-mode",
    cfg.permissionMode,
  ];

  const child = spawn("claude", args, {
    cwd: cfg.repo,
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
  });

  // Liveness while executing: without this, a long Claude run with no tool
  // events for 90s would look like a dead runner and the hub would requeue the
  // task out from under us.
  const heartbeat = setInterval(() => {
    void hub(cfg, "POST", `/api/runner/heartbeat`, { task_id: task.id });
  }, 20_000);

  const killTimer = setTimeout(() => {
    console.log(red(`task exceeded ${cfg.taskTimeoutMinutes}m — killing session`));
    child.kill("SIGKILL");
  }, cfg.taskTimeoutMinutes * 60_000);

  let resultText = "";
  let toolCount = 0;
  let stderrTail = "";

  child.stderr.on("data", (d: Buffer) => {
    stderrTail = (stderrTail + d.toString()).slice(-2000);
  });

  const rl = readline.createInterface({ input: child.stdout });
  for await (const line of rl) {
    let event: StreamEvent;
    try {
      event = JSON.parse(line);
    } catch {
      continue; // non-JSON noise on stdout is not an error
    }

    if (event.type === "assistant" && event.message?.content) {
      for (const block of event.message.content) {
        if (block.type !== "tool_use") continue;
        toolCount++;
        const input = block.input ?? {};
        const filePath = typeof input.file_path === "string" ? input.file_path : undefined;
        const command = typeof input.command === "string" ? input.command : undefined;

        const shortFile = filePath ? path.relative(cfg.repo, filePath) || filePath : undefined;
        const label =
          block.name === "Bash" && command
            ? `$ ${command.slice(0, 120)}`
            : shortFile
              ? `${block.name === "Read" ? "reading" : "editing"} ${shortFile}`
              : (block.name ?? "tool");

        console.log(dim(`  ${label}`));
        // Only mutating/observable actions become dashboard terminal lines;
        // reads would flood it.
        const isNoisy = block.name === "Read" || block.name === "Glob" || block.name === "Grep";
        await report(
          { kind: "tool", tool: block.name, file_path: shortFile, command },
          isNoisy ? undefined : `[${task.sub_agent}] ${label}`,
        );
      }
    }

    if (event.type === "result") {
      resultText = (event.result ?? "").trim();
    }
  }

  const exitCode: number = await new Promise((resolve) => child.on("close", (c) => resolve(c ?? 1)));
  clearTimeout(killTimer);
  clearInterval(heartbeat);

  const ok = exitCode === 0;
  const summary = ok
    ? resultText.slice(0, 1500) || `Completed with ${toolCount} actions.`
    : `Session exited ${exitCode}. ${stderrTail.slice(-300)}`;

  await hub(cfg, "POST", `/api/runner/tasks/${task.id}/complete`, {
    status: ok ? "done" : "failed",
    summary,
  });

  console.log(ok ? green(`  ✓ done (${toolCount} actions)`) : red(`  ✗ failed (exit ${exitCode})`));
  if (resultText) console.log(dim(`  ${resultText.split("\n")[0]?.slice(0, 160)}`));
}

/* ---------------------------------- main ----------------------------------- */

async function main() {
  const cmd = process.argv[2];
  if (cmd !== "start") {
    console.log(`roster-runner — real agent sessions for Roster

usage:
  roster-runner start --hub <url> --token rt_... --repo <dir> [--save]
                      [--poll 5] [--max-turns 30] [--timeout 15]
                      [--permission-mode acceptEdits]

get a token: Roster dashboard → your company → runners (or POST /api/runners).`);
    process.exit(cmd ? 1 : 0);
  }

  const cfg = loadConfig();
  if (!cfg.token) {
    console.log(red("no runner token. Pass --token rt_... (mint one from the dashboard)"));
    process.exit(1);
  }
  if (!existsSync(cfg.repo)) {
    console.log(red(`repo directory does not exist: ${cfg.repo}`));
    process.exit(1);
  }
  // Refuse to run outside a git repo: agents edit files, and git is the safety
  // net that makes every change reviewable and reversible.
  if (!existsSync(path.join(cfg.repo, ".git"))) {
    console.log(red(`${cfg.repo} is not a git repository — agents only work in git repos`));
    process.exit(1);
  }

  console.log("");
  console.log(bold("roster-runner"));
  console.log(`  hub:   ${cfg.hub}`);
  console.log(`  repo:  ${cfg.repo}`);
  console.log(`  agent: your local claude CLI (${cfg.permissionMode}, max ${cfg.maxTurns} turns)`);
  console.log(dim("  polling for tasks — Ctrl-C to stop\n"));

  const workspace = encodeURIComponent(path.basename(cfg.repo));
  let idleDots = 0;

  for (;;) {
    const next = await hub<NextTask>(cfg, "GET", `/api/runner/next-task?workspace=${workspace}`);
    if (next?.task) {
      idleDots = 0;
      try {
        await runTask(cfg, next.task);
      } catch (err) {
        console.log(red(`task crashed: ${(err as Error).message}`));
        await hub(cfg, "POST", `/api/runner/tasks/${next.task.id}/complete`, {
          status: "failed",
          summary: `runner error: ${(err as Error).message}`,
        });
      }
      continue; // immediately check for the next task
    }
    idleDots = (idleDots + 1) % 10;
    process.stdout.write(`\r${dim(`waiting${".".repeat(idleDots)}   `)}`);
    await new Promise((r) => setTimeout(r, cfg.pollSeconds * 1000));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
