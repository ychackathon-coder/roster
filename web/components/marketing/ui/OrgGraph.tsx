"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { AgentCard } from "@/components/marketing/ui/AgentCard";
import { depthOf } from "@/components/marketing/lib/scan";
import { useReducedMotion } from "@/components/marketing/motion/useReducedMotion";
import type { Agent } from "@/components/marketing/lib/types";

interface Props {
  agents: Agent[];
}

interface Wire {
  key: string;
  d: string;
}

const CARD_STAGGER_MS = 120;

/**
 * Lays the roster out by depth and draws the reporting wires between cards.
 * Positions are measured from the DOM rather than computed, so the graph stays
 * correct through wrapping, resizes, and font loading.
 */
export function OrgGraph({ agents }: Props) {
  const reduced = useReducedMotion();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef(new Map<string, HTMLDivElement>());
  const [wires, setWires] = useState<Wire[]>([]);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [revealed, setRevealed] = useState(reduced);
  const [wiresVisible, setWiresVisible] = useState(reduced);

  const rows = useMemo(() => {
    const depths = depthOf(agents);
    const grouped = new Map<number, Agent[]>();
    for (const agent of agents) {
      const depth = depths.get(agent.role) ?? 0;
      const row = grouped.get(depth) ?? [];
      row.push(agent);
      grouped.set(depth, row);
    }
    return [...grouped.entries()].sort((a, b) => a[0] - b[0]).map(([, row]) => row);
  }, [agents]);

  /** Index of each agent in the flat roster, for the stagger and card numbers. */
  const orderOf = useMemo(() => {
    const map = new Map<string, number>();
    let index = 0;
    for (const row of rows) for (const agent of row) map.set(agent.role, index++);
    return map;
  }, [rows]);

  const measure = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const base = container.getBoundingClientRect();
    setSize({ width: base.width, height: base.height });

    const next: Wire[] = [];
    for (const agent of agents) {
      if (!agent.reportsTo) continue;
      const childEl = cardRefs.current.get(agent.role);
      const parentEl = cardRefs.current.get(agent.reportsTo);
      if (!childEl || !parentEl) continue;

      const child = childEl.getBoundingClientRect();
      const parent = parentEl.getBoundingClientRect();

      const x1 = parent.left - base.left + parent.width / 2;
      const y1 = parent.top - base.top + parent.height;
      const x2 = child.left - base.left + child.width / 2;
      const y2 = child.top - base.top;
      const mid = (y2 - y1) / 2;

      next.push({
        key: `${agent.reportsTo}->${agent.role}`,
        d: `M ${x1} ${y1} C ${x1} ${y1 + mid}, ${x2} ${y2 - mid}, ${x2} ${y2}`,
      });
    }
    setWires(next);
  }, [agents]);

  useLayoutEffect(() => {
    measure();
  }, [measure]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => measure());
    observer.observe(container);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [measure]);

  // Deal the cards, then draw the wires once they have all settled.
  useEffect(() => {
    if (reduced) return;
    const cards = requestAnimationFrame(() => setRevealed(true));
    const wireTimer = setTimeout(
      () => setWiresVisible(true),
      agents.length * CARD_STAGGER_MS + 260,
    );
    return () => {
      cancelAnimationFrame(cards);
      clearTimeout(wireTimer);
    };
  }, [agents, reduced]);

  return (
    <div ref={containerRef} className="relative">
      <svg
        aria-hidden
        className="pointer-events-none absolute inset-0 h-full w-full"
        viewBox={`0 0 ${size.width || 1} ${size.height || 1}`}
        preserveAspectRatio="none"
      >
        {wires.map((wire) => (
          <path
            key={wire.key}
            d={wire.d}
            fill="none"
            stroke="var(--grid-lo)"
            strokeWidth="1"
            pathLength={1}
            strokeDasharray={1}
            strokeDashoffset={wiresVisible ? 0 : 1}
            style={{
              transition: reduced ? "none" : "stroke-dashoffset 900ms cubic-bezier(0.16,1,0.3,1)",
            }}
          />
        ))}
      </svg>

      <div className="relative flex flex-col gap-8 sm:gap-10">
        {rows.map((row, rowIndex) => (
          <div
            key={rowIndex}
            className="flex flex-wrap justify-center gap-4 sm:gap-5"
          >
            {row.map((agent) => {
              const order = orderOf.get(agent.role) ?? 0;
              return (
                <div
                  key={agent.role}
                  ref={(el) => {
                    if (el) cardRefs.current.set(agent.role, el);
                    else cardRefs.current.delete(agent.role);
                  }}
                  className="w-full max-w-[22rem] flex-1 basis-[17rem]"
                  style={{
                    opacity: revealed ? 1 : 0,
                    transform: revealed ? "translateY(0)" : "translateY(18px)",
                    transition: reduced
                      ? "none"
                      : `opacity 700ms cubic-bezier(0.16,1,0.3,1) ${order * CARD_STAGGER_MS}ms, transform 700ms cubic-bezier(0.16,1,0.3,1) ${order * CARD_STAGGER_MS}ms`,
                  }}
                >
                  <AgentCard agent={agent} index={order + 1} lead={agent.reportsTo === null} />
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
