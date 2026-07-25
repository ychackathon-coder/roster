export type OperationStatus = "Running" | "Reviewing" | "Waiting for approval" | "Blocked";

export type Operation = {
  id: number;
  agent: string;
  assignment: string;
  team: string;
  status: OperationStatus;
  progress: number;
  elapsed: string;
  initials: string;
  accent: string;
};

export const operations: Operation[] = [
  {
    id: 1,
    agent: "Build Agent",
    assignment: "Investigating CI failure",
    team: "Engineering",
    status: "Running",
    progress: 68,
    elapsed: "08:42",
    initials: "BA",
    accent: "violet",
  },
  {
    id: 2,
    agent: "Research Agent",
    assignment: "Compiling competitor brief",
    team: "Strategy",
    status: "Reviewing",
    progress: 86,
    elapsed: "24:11",
    initials: "RA",
    accent: "blue",
  },
  {
    id: 3,
    agent: "Support Agent",
    assignment: "Resolving enterprise escalation",
    team: "Support",
    status: "Waiting for approval",
    progress: 72,
    elapsed: "13:08",
    initials: "SA",
    accent: "amber",
  },
  {
    id: 4,
    agent: "Documentation Agent",
    assignment: "Updating release notes",
    team: "Engineering",
    status: "Running",
    progress: 54,
    elapsed: "06:19",
    initials: "DA",
    accent: "mint",
  },
  {
    id: 5,
    agent: "Finance Agent",
    assignment: "Reconciling invoice exceptions",
    team: "Operations",
    status: "Blocked",
    progress: 31,
    elapsed: "42:53",
    initials: "FA",
    accent: "rose",
  },
];

export const teamData = {
  "Last 7 days": [
    { day: "Mon", completed: 128, interventions: 12 },
    { day: "Tue", completed: 151, interventions: 14 },
    { day: "Wed", completed: 142, interventions: 11 },
    { day: "Thu", completed: 184, interventions: 13 },
    { day: "Fri", completed: 196, interventions: 9 },
    { day: "Sat", completed: 174, interventions: 8 },
    { day: "Sun", completed: 218, interventions: 10 },
  ],
  "Last 30 days": [
    { day: "W1", completed: 612, interventions: 58 },
    { day: "W2", completed: 724, interventions: 49 },
    { day: "W3", completed: 805, interventions: 46 },
    { day: "W4", completed: 932, interventions: 41 },
  ],
  "Last quarter": [
    { day: "Apr", completed: 2410, interventions: 188 },
    { day: "May", completed: 2782, interventions: 169 },
    { day: "Jun", completed: 3194, interventions: 146 },
  ],
};

export const sparkData = [
  [34, 36, 35, 42, 39, 46, 44, 51],
  [28, 31, 38, 35, 43, 45, 49, 54],
  [22, 27, 24, 29, 26, 32, 28, 25],
  [31, 35, 34, 40, 46, 43, 50, 57],
];
