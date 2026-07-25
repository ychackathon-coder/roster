import type { Agent } from "@/lib/types";

/**
 * Zod proves the shape; it cannot prove the graph is drawable. Models routinely
 * return two roots, a `reportsTo` naming an agent that is not in the list, or a
 * cycle. OrgGraph would render garbage or loop forever on any of those, so we
 * repair the edges here rather than defending inside the component.
 */
export function normalizeGraph(agents: Agent[]): Agent[] {
  if (agents.length === 0) return agents;

  const byRole = new Map<string, Agent>();
  // Duplicate roles would make `reportsTo` ambiguous. First one wins.
  const unique = agents.filter((agent) => {
    if (byRole.has(agent.role)) return false;
    byRole.set(agent.role, agent);
    return true;
  });

  // Pick a single root: the first agent that declared itself one, else index 0.
  const root = unique.find((agent) => agent.reportsTo === null) ?? unique[0]!;

  const repaired = unique.map((agent) => {
    if (agent === root) return { ...agent, reportsTo: null };

    const target = agent.reportsTo;
    const valid = target !== null && target !== agent.role && byRole.has(target);
    return { ...agent, reportsTo: valid ? target : root.role };
  });

  return breakCycles(repaired, root.role);
}

/** Re-parents any agent whose chain of managers never reaches the root. */
function breakCycles(agents: Agent[], rootRole: string): Agent[] {
  const parentOf = new Map(agents.map((a) => [a.role, a.reportsTo]));

  return agents.map((agent) => {
    if (agent.reportsTo === null) return agent;

    const seen = new Set<string>([agent.role]);
    let cursor: string | null = agent.reportsTo;

    while (cursor !== null && cursor !== rootRole) {
      if (seen.has(cursor)) return { ...agent, reportsTo: rootRole };
      seen.add(cursor);
      cursor = parentOf.get(cursor) ?? null;
    }

    return cursor === null && agent.reportsTo !== rootRole
      ? { ...agent, reportsTo: rootRole }
      : agent;
  });
}

/** Depth of each agent from the root, used for graph layout. */
export function depthOf(agents: Agent[]): Map<string, number> {
  const parentOf = new Map(agents.map((a) => [a.role, a.reportsTo]));
  const depths = new Map<string, number>();

  for (const agent of agents) {
    let depth = 0;
    let cursor: string | null = agent.reportsTo;
    while (cursor !== null && depth < 8) {
      depth += 1;
      cursor = parentOf.get(cursor) ?? null;
    }
    depths.set(agent.role, depth);
  }

  return depths;
}
