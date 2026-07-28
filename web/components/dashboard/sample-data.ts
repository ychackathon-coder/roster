/**
 * ILLUSTRATIVE DATA ONLY.
 *
 * These two datasets feed the decorative performance/spark charts — visual
 * texture, not company data. Everything real on the dashboard (agents,
 * operations, activity, terminal, metrics) comes from useLive()/@/lib/live;
 * nothing in this file may be presented as an employee, task, or event.
 */

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
