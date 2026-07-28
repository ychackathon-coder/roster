/**
 * Shared contracts for the whole product — web app, API routes, and the runner
 * speak exactly these shapes. One file so nothing drifts.
 */

/* --------------------------------- company --------------------------------- */

export type Org = {
  id: string;
  name: string;
  invite_code: string;
  created_by: string;
  created_at: string;
};

export type Membership = {
  org_id: string;
  user_id: string;
  role: "owner" | "member";
  display_name: string;
};

/* --------------------------------- profile --------------------------------- */

/** Derived from a real GitHub repo at onboarding — HQ's calibration source. */
export type TeamProfile = {
  archetype: string;
  summary: string;
  traits: string[];
  directive: string;
  source_repo: string;
};

/* ---------------------------------- events --------------------------------- */

export type Decision = "route_existing" | "spawn_new" | "handle_direct";

export type EventRow = {
  id: string;
  org_id: string;
  team: string;
  user: string | null;
  request: string;
  decision: Decision;
  sub_agent: string;
  reasoning: string;
  terminal_line: string;
  /** ISO timestamp */
  at: string;
};

/* ---------------------------------- tasks ---------------------------------- */

export type TaskStatus = "queued" | "claimed" | "running" | "done" | "failed";

/** A unit of real work a runner executes with a live Claude Code session. */
export type Task = {
  id: string;
  org_id: string;
  event_id: string | null;
  request: string;
  team: string;
  requested_by: string | null;
  sub_agent: string;
  prompt: string;
  status: TaskStatus;
  runner_id: string | null;
  result_summary: string | null;
  /** Count of real tool actions streamed so far (edits, commands). */
  activity_count: number;
  created_at: string;
  updated_at: string;
};

export type Runner = {
  id: string;
  org_id: string;
  name: string;
  /** Directory the runner executes in — agents only touch what it was pointed at. */
  workspace: string | null;
  status: "online" | "offline";
  last_seen: string;
};

/** One real action inside an agent session, parsed from the Claude stream. */
export type AgentActivity = {
  kind: "session_start" | "tool" | "text" | "done" | "error";
  tool?: string;
  file_path?: string;
  command?: string;
  summary?: string;
};

/* ------------------------------ dashboard feed ----------------------------- */

/** Shapes the dashboard renders — mapped server-side in /api/state. */
export type OperationStatus = "Running" | "Reviewing" | "Waiting for approval" | "Blocked";

export type Operation = {
  id: string;
  agent: string;
  assignment: string;
  team: string;
  status: OperationStatus;
  progress: number;
  elapsed: string;
  initials: string;
  accent: string;
};

export type AgentNode = {
  id: string;
  name: string;
  initials: string;
  team: "Engineering" | "Sales" | "Support" | "Operations";
  working: boolean;
  task: string;
  progress: number;
  elapsed: string;
};

export type ActivityItem = {
  id: string;
  agent: string;
  text: string;
  detail: string;
  team: string;
  user: string | null;
  ago: string;
};

export type Metrics = {
  activeAgents: number;
  tasksCompleted: number;
  interventionRate: number;
  pendingApprovals: number;
  runnersOnline: number;
};

/** Everything the dashboard needs, in one poll. */
export type StateSnapshot = {
  org: Pick<Org, "id" | "name" | "invite_code"> | null;
  profile: TeamProfile | null;
  events: EventRow[];
  tasks: Task[];
  runners: Runner[];
  operations: Operation[];
  agents: AgentNode[];
  activity: ActivityItem[];
  terminal: string[];
  metrics: Metrics;
};

/* ------------------------------ runner protocol ----------------------------- */

export type NextTaskResponse = {
  task: (Pick<Task, "id" | "request" | "sub_agent" | "prompt" | "team"> & {
    profile: TeamProfile | null;
  }) | null;
};

export type RunnerActivityBody = {
  activity: AgentActivity;
  /** Optional line for the dashboard terminal. */
  terminal_line?: string;
};

export type CompleteTaskBody = {
  status: "done" | "failed";
  summary: string;
};
