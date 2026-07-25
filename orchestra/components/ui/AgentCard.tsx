"use client";

import type { Agent } from "@/lib/types";

interface Props {
  agent: Agent;
  index: number;
  /** Root of the org graph gets the accent treatment. */
  lead?: boolean;
}

/** One agent: who it is, what it owns, what it touches. */
export function AgentCard({ agent, index, lead = false }: Props) {
  return (
    <article
      className="panel group relative flex h-full flex-col gap-3.5 rounded-xl p-5 transition-colors duration-300 hover:border-white/20"
      style={{ borderColor: lead ? "rgba(61, 124, 255,0.35)" : undefined }}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="mono-label" style={{ color: lead ? "var(--accent)" : undefined }}>
          {lead ? "lead" : String(index).padStart(2, "0")}
        </span>
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ background: lead ? "var(--accent)" : "var(--grid-hi)" }}
        />
      </div>

      <h3 className="text-[1.375rem] font-semibold leading-tight tracking-[-0.02em] text-fg">
        {agent.role}
      </h3>

      <p className="text-[0.9375rem] leading-relaxed text-fg-dim">{agent.mandate}</p>

      <ul className="mt-auto flex flex-wrap gap-1.5 pt-1">
        {agent.tools.map((tool) => (
          <li
            key={tool}
            className="rounded-full border border-hairline px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.1em] text-fg-dim"
          >
            {tool}
          </li>
        ))}
      </ul>
    </article>
  );
}
