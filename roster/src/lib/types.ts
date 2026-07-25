/** Shared contracts — ROSTER_BUILD_PLAN §5 / Person D §4 */

export type TeamProfile = {
  archetype: string;
  summary: string;
  traits: string[];
  directive: string;
  source_repo: string;
};

export type ContributorNote = {
  handle: string;
  note: string;
};

export type Decision = "route_existing" | "spawn_new" | "handle_direct";

export type RosterEvent = {
  id: string;
  team: string;
  user: string | null;
  request: string;
  decision: Decision;
  sub_agent: string;
  reasoning: string;
  terminal_line: string;
  timestamp: string;
};

export type RepoRawData = {
  fullName: string;
  url: string;
  description: string | null;
  language: string | null;
  topics: string[];
  stars: number;
  readme: string;
  commits: { sha: string; message: string; author: string | null; date: string | null }[];
};

export type HqRequest = {
  profile: TeamProfile;
  request: string;
  team: string;
  user?: string | null;
  recent_events?: RosterEvent[];
};

export type HqResponse = {
  decision: Decision;
  sub_agent: string;
  reasoning: string;
  terminal_line: string;
};
