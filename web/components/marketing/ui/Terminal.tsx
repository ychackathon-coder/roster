"use client";

import { useEffect, useRef, useState } from "react";

import { useReducedMotion } from "@/components/marketing/motion/useReducedMotion";

interface Props {
  /** Append-only. New entries stream in as they arrive. */
  lines: string[];
  /** Shows the caret and a pulsing status row while the request is open. */
  busy?: boolean;
  label?: string;
  className?: string;
}

const CHAR_MS = 9;
const LINE_GAP_MS = 130;

/**
 * Mono panel that types its lines. Deliberately append-only: callers push
 * deterministic local lines first, then result-derived ones, and the panel
 * never shows an empty box while a scan is in flight.
 */
export function Terminal({ lines, busy = false, label = "scan", className }: Props) {
  const reduced = useReducedMotion();
  const [done, setDone] = useState<string[]>([]);
  const [partial, setPartial] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (reduced) {
      setDone(lines);
      setPartial("");
      return;
    }

    // Nothing new to type. Guard first so re-renders do not restart the line.
    if (done.length >= lines.length) return;

    const next = lines[done.length]!;
    let index = 0;
    let charTimer: ReturnType<typeof setInterval>;

    const gap = setTimeout(() => {
      charTimer = setInterval(() => {
        index += 1;
        setPartial(next.slice(0, index));
        if (index >= next.length) {
          clearInterval(charTimer);
          setDone((prev) => [...prev, next]);
          setPartial("");
        }
      }, CHAR_MS);
    }, done.length === 0 ? 0 : LINE_GAP_MS);

    return () => {
      clearTimeout(gap);
      clearInterval(charTimer);
    };
  }, [lines, done.length, reduced]);

  // Keep the newest line in view without yanking the page scroll position.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [done.length, partial]);

  const streaming = done.length < lines.length;

  return (
    <div className={`panel rounded-xl ${className ?? ""}`}>
      <div className="flex items-center gap-2 border-b border-hairline px-4 py-2.5">
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{ background: busy || streaming ? "var(--accent)" : "var(--fg-dim)" }}
        />
        <span className="mono-label">orchestra {label}</span>
      </div>

      <div
        ref={scrollRef}
        role="status"
        aria-live="polite"
        className="mono-sm max-h-[42vh] min-h-[8.5rem] overflow-y-auto px-4 py-3.5 text-fg-dim"
      >
        {done.map((line, index) => (
          <p key={index} className="whitespace-pre-wrap">
            <span className="mr-2 select-none text-accent">›</span>
            <span className={index === 0 ? "text-fg" : undefined}>{line}</span>
          </p>
        ))}

        {partial && (
          <p className="whitespace-pre-wrap">
            <span className="mr-2 select-none text-accent">›</span>
            {partial}
            <span className="caret ml-0.5 !h-[0.9em] !w-[0.45em]" />
          </p>
        )}

        {!partial && (busy || streaming) && (
          <p>
            <span className="mr-2 select-none text-accent">›</span>
            <span className="caret !h-[0.9em] !w-[0.45em]" />
          </p>
        )}
      </div>
    </div>
  );
}
