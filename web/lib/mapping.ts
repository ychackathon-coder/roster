/**
 * Server-side mapping from raw rows to the shapes the dashboard renders.
 * The client stays dumb; every derivation lives here, next to the data.
 */
import type {
  ActivityItem,
  AgentNode,
  EventRow,
  Metrics,
  Operation,
  OperationStatus,
  Runner,
  StateSnapshot,
  Task,
  TeamProfile,
} from "./contracts";
import { teamToDepartment } from "./hq/engine";

const ACCENTS = ["violet", "blue", "amber", "mint", "rose"] as const;

export function initialsOf(name: string): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "??";
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return (words[0]![0]! + words[words.length - 1]![0]!).toUpperCase();
}

function accentFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return ACCENTS[Math.abs(hash) % ACCENTS.length]!;
}

function elapsedSince(iso: string): string {
  const ms = Math.max(0, Date.now() - Date.parse(iso));
  const total = Math.floor(ms / 1000);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  if (mins >= 60) {
    const hrs = Math.floor(mins / 60);
    return `${hrs}:${String(mins % 60).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export function agoLabel(iso: string): string {
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms)) return "";
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function taskStatusToOperation(status: Task["status"]): OperationStatus {
  switch (status) {
    case "running":
    case "claimed":
      return "Running";
    case "queued":
      // Waiting for a runner to pick it up.
      return "Waiting for approval";
    case "failed":
      return "Blocked";
    case "done":
      return "Reviewing";
  }
}

/**
 * Progress is real: derived from streamed activity counts, not decoration.
 * 10% for being claimed, ~7% per observed tool action, capped until done.
 */
function taskProgress(t: Task): number {
  if (t.status === "done") return 100;
  if (t.status === "queued") return 0;
  return Math.min(95, 10 + t.activity_count * 7);
}

export function buildSnapshot(a: {
  org: { id: string; name: string; invite_code: string };
  profile: TeamProfile | null;
  events: EventRow[];
  tasks: Task[];
  runners: Runner[];
}): StateSnapshot {
  const { events, tasks, runners } = a;

  const activeTasks = tasks.filter((t) => t.status !== "done" || Date.parse(t.updated_at) > Date.now() - 10 * 60_000);
  const operations: Operation[] = activeTasks.slice(0, 8).map((t) => ({
    id: t.id,
    agent: t.sub_agent,
    assignment: t.request,
    team: teamToDepartment(t.team),
    status: taskStatusToOperation(t.status),
    progress: taskProgress(t),
    elapsed: elapsedSince(t.created_at),
    initials: initialsOf(t.sub_agent),
    accent: accentFor(t.sub_agent),
  }));

  // An agent exists once real work has referenced it. Working = has a live task.
  const byAgent = new Map<string, { latest: EventRow | Task; working: boolean; task: string; progress: number; at: string }>();
  for (const t of tasks) {
    const live = t.status === "claimed" || t.status === "running";
    const prev = byAgent.get(t.sub_agent);
    if (!prev || live) {
      byAgent.set(t.sub_agent, {
        latest: t,
        working: live || (prev?.working ?? false),
        task: t.request,
        progress: taskProgress(t),
        at: t.created_at,
      });
    }
  }
  for (const e of events) {
    if (e.sub_agent === "HQ") continue;
    if (!byAgent.has(e.sub_agent)) {
      byAgent.set(e.sub_agent, { latest: e, working: false, task: e.request, progress: 0, at: e.at });
    }
  }

  const agents: AgentNode[] = [...byAgent.entries()].map(([name, info]) => ({
    id: name.toLowerCase().replace(/\s+/g, "-"),
    name,
    initials: initialsOf(name),
    team: teamToDepartment("team" in info.latest ? info.latest.team : ""),
    working: info.working,
    task: info.task,
    progress: info.progress,
    elapsed: elapsedSince(info.at),
  }));

  const activity: ActivityItem[] = events.slice(0, 10).map((e) => ({
    id: e.id,
    agent: e.sub_agent,
    text: `${e.decision.replace(/_/g, " ")} — ${e.request}`,
    detail: e.reasoning,
    team: teamToDepartment(e.team),
    user: e.user,
    ago: agoLabel(e.at),
  }));

  const terminal = events
    .slice(0, 14)
    .map((e) => e.terminal_line)
    .filter(Boolean)
    .reverse();

  const done = tasks.filter((t) => t.status === "done").length;
  const spawned = events.filter((e) => e.decision === "spawn_new").length;
  const metrics: Metrics = {
    activeAgents: agents.filter((x) => x.working).length,
    tasksCompleted: done,
    interventionRate: events.length ? Math.round((spawned / events.length) * 100) : 0,
    pendingApprovals: tasks.filter((t) => t.status === "queued").length,
    runnersOnline: runners.filter((r) => r.status === "online").length,
  };

  return {
    org: a.org,
    profile: a.profile,
    events,
    tasks,
    runners,
    operations,
    agents,
    activity,
    terminal,
    metrics,
  };
}
