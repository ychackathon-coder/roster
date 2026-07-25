"use client";

import { useCallback, useRef } from "react";

import { AsciiBar, Spinner, TypeLines } from "@/components/ui/Ascii";
import { WordReveal } from "@/components/ui/WordReveal";
import { useHorizontalPin } from "@/lib/motion/useHorizontalPin";
import { useStaticLayout } from "@/lib/motion/useReducedMotion";

/** Track coordinates: x in vw of the track, y in percent of section height. */
interface Slot {
  x: number;
  y: number;
  rotate: number;
}

interface Window {
  id: string;
  /** Terminal title before the sort. */
  session: string;
  /** Live terminal output, typed character by character. `▲` lines are alerts. */
  lines: string[];
  /** Label for the crawling progress bar, or null for no bar. */
  bar: string | null;
  /** Header state: a healthy session, a dying one, or a collision. */
  tone: "live" | "lost" | "conflict";
  /** Who it becomes once the roster exists. */
  role: string;
  mandate: string;
  chaosSlot: Slot;
  orderSlot: Slot;
}

const TRACK_VW = 284;

const WINDOWS: Window[] = [
  {
    id: "w1",
    session: "sess-4a1 · maya",
    lines: ["rewriting session middleware", "34 files touched, no ticket", "nobody asked for this"],
    bar: "refactor",
    tone: "live",
    role: "Chief of Staff",
    mandate: "assigns every task, owns the queue",
    chaosSlot: { x: 46, y: 32, rotate: -6 },
    orderSlot: { x: 190, y: 16, rotate: 0 },
  },
  {
    id: "w2",
    session: "sess-9c3 · dev",
    lines: ["rewriting session middleware", "▲ same file as sess-4a1", "merge is going to hurt"],
    bar: null,
    tone: "conflict",
    role: "Build Engineer",
    mandate: "ticket to reviewed PR, one branch",
    chaosSlot: { x: 60, y: 50, rotate: 5 },
    orderSlot: { x: 160, y: 45, rotate: 0 },
  },
  {
    id: "w3",
    session: "sess-2f8 · unknown",
    lines: ["context lost, terminal closed", "▲ 3 hours of decisions gone", "who was driving this?"],
    bar: null,
    tone: "lost",
    role: "Support Triage",
    mandate: "resolves or escalates every ticket",
    chaosSlot: { x: 52, y: 68, rotate: -3 },
    orderSlot: { x: 190, y: 45, rotate: 0 },
  },
  {
    id: "w4",
    session: "sess-7b0 · jon",
    lines: ["editing checkout.ts", "▲ file held by 2 other sessions", "last write wins, apparently"],
    bar: null,
    tone: "conflict",
    role: "Incident Watch",
    mandate: "opens the incident, writes the timeline",
    chaosSlot: { x: 68, y: 28, rotate: 8 },
    orderSlot: { x: 220, y: 45, rotate: 0 },
  },
  {
    id: "w5",
    session: "sess-1d5 · maya",
    lines: ["answering ticket #4127", "already answered at 09:14", "customer now has two answers"],
    bar: null,
    tone: "live",
    role: "Docs Writer",
    mandate: "every shipped change gets documented",
    chaosSlot: { x: 72, y: 62, rotate: -5 },
    orderSlot: { x: 174, y: 74, rotate: 0 },
  },
  {
    id: "w6",
    session: "sess-6e2 · ???",
    lines: ["running prod migrations", "▲ no owner attached", "nobody will notice, right"],
    bar: "migration",
    tone: "conflict",
    role: "Pipeline Research",
    mandate: "briefs every lead before a human replies",
    chaosSlot: { x: 58, y: 44, rotate: 3 },
    orderSlot: { x: 206, y: 74, rotate: 0 },
  },
];

/** Reporting edges, by index into WINDOWS. Drawn as the roster settles. */
const EDGES: [number, number][] = [
  [0, 1],
  [0, 2],
  [0, 3],
  [1, 4],
  [2, 5],
];

const SORT_START = 0.18;
const SORT_END = 0.78;

const TONE_LABEL: Record<Window["tone"], string> = {
  live: "live",
  lost: "no owner",
  conflict: "collision",
};

/** Act 3. Six unsupervised terminals de-overlap into one roster. */
export function ActMess() {
  const staticLayout = useStaticLayout();
  const windowRefs = useRef<(HTMLDivElement | null)[]>([]);
  const bodyRefs = useRef<(HTMLDivElement | null)[]>([]);
  const roleRefs = useRef<(HTMLDivElement | null)[]>([]);
  const wireRef = useRef<SVGGElement | null>(null);

  const onProgress = useCallback((progress: number) => {
    const raw = (progress - SORT_START) / (SORT_END - SORT_START);
    const t = Math.min(1, Math.max(0, raw));
    // Same deceleration curve the rest of the page uses.
    const eased = 1 - Math.pow(1 - t, 3);

    WINDOWS.forEach((win, index) => {
      const el = windowRefs.current[index];
      if (!el) return;
      const x = lerp(win.chaosSlot.x, win.orderSlot.x, eased);
      const y = lerp(win.chaosSlot.y, win.orderSlot.y, eased);
      const rotate = lerp(win.chaosSlot.rotate, win.orderSlot.rotate, eased);
      el.style.left = `${x}vw`;
      el.style.top = `${y}%`;
      el.style.transform = `translate(-50%, -50%) rotate(${rotate}deg)`;
      el.style.zIndex = String(eased > 0.5 ? 10 : 10 + index);

      const chaosBody = bodyRefs.current[index];
      if (chaosBody) chaosBody.style.opacity = String(1 - Math.min(1, eased * 1.8));
      const roleBody = roleRefs.current[index];
      if (roleBody) roleBody.style.opacity = String(Math.max(0, eased * 1.8 - 0.8));
    });

    if (wireRef.current) {
      wireRef.current.style.opacity = String(Math.max(0, eased * 2 - 1));
      wireRef.current.style.setProperty("--wire-offset", String(1 - Math.max(0, eased * 2 - 1)));
    }
  }, []);

  const { sectionRef, trackRef } = useHorizontalPin<HTMLElement, HTMLDivElement>({
    disabled: staticLayout,
    lengthMultiplier: 1.15,
    onProgress,
  });

  if (staticLayout) return <MessStatic />;

  return (
    <section
      id="mess"
      ref={sectionRef}
      className="relative h-[100svh] overflow-hidden"
      aria-label="The mess"
    >
      <div
        ref={trackRef}
        className="relative h-full"
        style={{ width: `${TRACK_VW}vw`, willChange: "transform" }}
      >
        {/* Opening copy, left edge of the track. */}
        <div className="absolute left-[4vw] top-1/2 w-[27vw] -translate-y-1/2">
          <p className="mono-label mb-5">Before</p>
          <WordReveal
            as="h2"
            text="Everyone is working. Nobody is coordinated."
            accent={["Nobody"]}
            className="display display-lg text-balance"
            onView
          />
          <p className="mono-sm mt-6 max-w-[38ch] text-fg-dim">
            Two people refactoring the same middleware. A ticket answered twice. A migration running
            with no name attached to it. Every closed terminal takes its context with it.
          </p>
        </div>

        {/* Closing copy, right edge. */}
        <div className="absolute left-[244vw] top-1/2 w-[28vw] -translate-y-1/2">
          <p className="mono-label mb-5">After</p>
          <h2 className="display display-lg text-balance">One owner per lane.</h2>
          <p className="mono-sm mt-6 max-w-[34ch] text-fg-dim">
            Same six sessions. Each one now has a role, a mandate, and a manager it reports to. No
            two agents can claim the same work.
          </p>
        </div>

        <svg
          aria-hidden
          className="pointer-events-none absolute inset-0 h-full w-full"
          viewBox={`0 0 ${TRACK_VW} 100`}
          preserveAspectRatio="none"
        >
          <g ref={wireRef} style={{ opacity: 0 }}>
            {EDGES.map(([from, to]) => {
              const a = WINDOWS[from]!.orderSlot;
              const b = WINDOWS[to]!.orderSlot;
              const mid = (b.y - a.y) / 2;
              return (
                <path
                  key={`${from}-${to}`}
                  d={`M ${a.x} ${a.y + 12} C ${a.x} ${a.y + mid}, ${b.x} ${b.y - mid}, ${b.x} ${b.y - 12}`}
                  fill="none"
                  stroke="var(--grid-lo)"
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                  pathLength={1}
                  strokeDasharray={1}
                  style={{ strokeDashoffset: "var(--wire-offset, 1)" }}
                />
              );
            })}
          </g>
        </svg>

        {WINDOWS.map((win, index) => (
          <div
            key={win.id}
            ref={(el) => {
              windowRefs.current[index] = el;
            }}
            className="panel absolute w-[23vw] min-w-[300px] max-w-[420px] overflow-hidden rounded-lg"
            style={{
              left: `${win.chaosSlot.x}vw`,
              top: `${win.chaosSlot.y}%`,
              transform: `translate(-50%, -50%) rotate(${win.chaosSlot.rotate}deg)`,
              zIndex: 10 + index,
              willChange: "transform, left, top",
              boxShadow:
                win.tone === "conflict"
                  ? "0 24px 80px -40px rgba(61, 124, 255,0.55)"
                  : "0 24px 80px -48px rgba(0,0,0,0.9)",
            }}
          >
            {/* faint CRT scanlines keep the glass feeling like a screen */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 z-20 opacity-[0.05]"
              style={{
                background: "repeating-linear-gradient(0deg, transparent 0 2px, rgba(255,255,255,0.8) 2px 3px)",
              }}
            />

            <div className="flex items-center gap-2.5 border-b border-hairline px-4 py-2.5">
              <span className="flex gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ background: "var(--accent)" }} />
                <span className="h-2 w-2 rounded-full" style={{ background: "var(--grid-lo)" }} />
                <span className="h-2 w-2 rounded-full" style={{ background: "var(--grid-lo)" }} />
              </span>
              <span className="mono-label truncate !text-[12px]">{win.session}</span>
              <span className="ml-auto flex items-center gap-1.5">
                {win.tone === "live" ? (
                  <Spinner className="text-[12px]" />
                ) : (
                  <span
                    className="inline-block h-1.5 w-1.5 rounded-full"
                    style={{ background: "var(--accent)", animation: "caret-blink 1.05s steps(1) infinite" }}
                  />
                )}
                <span
                  className="mono-label !text-[10px]"
                  style={{ color: win.tone === "live" ? undefined : "var(--accent)" }}
                >
                  {TONE_LABEL[win.tone]}
                </span>
              </span>
            </div>

            <div className="relative h-[9.5rem] px-4 py-3">
              <div
                ref={(el) => {
                  bodyRefs.current[index] = el;
                }}
                className="absolute inset-x-4 top-3 font-mono text-[13px] leading-[1.7] text-fg-dim"
              >
                <TypeLines lines={win.lines} speed={26 + index * 3} />
                {win.bar && (
                  <div className="mt-1.5">
                    <AsciiBar label={win.bar} />
                  </div>
                )}
              </div>

              <div
                ref={(el) => {
                  roleRefs.current[index] = el;
                }}
                className="absolute inset-x-4 top-3"
                style={{ opacity: 0 }}
              >
                <p className="mono-label !text-[10px]" style={{ color: "var(--accent)" }}>
                  {index === 0 ? "lead" : `agent ${String(index + 1).padStart(2, "0")}`}
                </p>
                <p className="mt-1.5 text-[1.375rem] font-semibold leading-tight tracking-[-0.015em] text-fg">
                  {win.role}
                </p>
                <p className="mt-2 font-mono text-[13px] leading-[1.6] text-fg-dim">{win.mandate}</p>
                <p className="mt-2.5 font-mono text-[12px] text-fg-dim">
                  <span style={{ color: "var(--accent)" }}>▮</span> owner assigned · context retained
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Mobile and reduced-motion path: the same content, plainly stacked. */
function MessStatic() {
  return (
    <section id="mess" className="px-5 py-24 sm:px-8" aria-label="The mess">
      <div className="mx-auto max-w-3xl">
        <p className="mono-label mb-5">Before</p>
        <h2 className="display display-lg text-balance">
          Everyone is working. <span style={{ color: "var(--accent)" }}>Nobody</span> is coordinated.
        </h2>
        <p className="mono-sm mt-6 max-w-[46ch] text-fg-dim">
          Two people refactoring the same middleware. A ticket answered twice. A migration running
          with no name attached to it. Every closed terminal takes its context with it.
        </p>

        <ul className="mt-10 space-y-3">
          {WINDOWS.map((win) => (
            <li key={win.id} className="panel rounded-lg px-4 py-3">
              <p className="mono-label">{win.session}</p>
              <p className="mono-sm mt-1.5 text-fg-dim">
                <span className="mr-1.5 text-accent">›</span>
                {win.lines[0]}
              </p>
            </li>
          ))}
        </ul>

        <p className="mono-label mb-5 mt-20">After</p>
        <h2 className="display display-lg text-balance">One owner per lane.</h2>
        <ul className="mt-10 space-y-3">
          {WINDOWS.map((win) => (
            <li key={win.id} className="panel rounded-lg px-4 py-3">
              <p className="text-[1.0625rem] font-semibold tracking-[-0.015em] text-fg">
                {win.role}
              </p>
              <p className="mono-sm mt-1 text-fg-dim">{win.mandate}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}
