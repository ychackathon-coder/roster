"use client";

// Small ASCII life-signs used across the page: a braille spinner, a █░ progress
// bar, a character-by-character typer, and a marching divider strip. All of
// them freeze under reduced motion by rendering their final frame.

import { useEffect, useRef, useState } from "react";

import { useReducedMotion } from "@/lib/motion/useReducedMotion";

const SPIN_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export function Spinner({ className }: { className?: string }) {
  const reduced = useReducedMotion();
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (reduced) return;
    const timer = setInterval(() => setFrame((f) => (f + 1) % SPIN_FRAMES.length), 80);
    return () => clearInterval(timer);
  }, [reduced]);

  return (
    <span aria-hidden className={className} style={{ color: "var(--accent)" }}>
      {SPIN_FRAMES[frame]}
    </span>
  );
}

/** An animated `████░░░░ 62%` bar that crawls up, stalls, and starts over. */
export function AsciiBar({ label, width = 14 }: { label: string; width?: number }) {
  const reduced = useReducedMotion();
  const [pct, setPct] = useState(reduced ? 76 : 3);

  useEffect(() => {
    if (reduced) return;
    const timer = setInterval(() => {
      setPct((p) => {
        if (p >= 97) return 3;
        // slower as it climbs, like a real transfer that will never finish
        return p + Math.max(1, Math.round((100 - p) / 18)) * (Math.random() < 0.85 ? 1 : 0);
      });
    }, 260);
    return () => clearInterval(timer);
  }, [reduced]);

  const filled = Math.round((pct / 100) * width);
  return (
    <span className="whitespace-pre">
      {label} <span style={{ color: "var(--accent)" }}>{"█".repeat(filled)}</span>
      <span style={{ color: "var(--grid-lo)" }}>{"░".repeat(width - filled)}</span> {String(pct).padStart(2, " ")}%
    </span>
  );
}

interface TypeLinesProps {
  lines: string[];
  /** ms per character. */
  speed?: number;
  /** Hold after the last line finishes, before wiping and retyping. */
  holdMs?: number;
  className?: string;
  /** Lines starting with this prefix render in the accent (alerts). */
  alertPrefix?: string;
}

/** Types a block of lines forever: type, hold, wipe, retype. */
export function TypeLines({ lines, speed = 28, holdMs = 2600, className, alertPrefix = "▲" }: TypeLinesProps) {
  const reduced = useReducedMotion();
  const total = lines.reduce((a, l) => a + l.length, 0);
  const [count, setCount] = useState(reduced ? total : 0);
  const holdRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (reduced) return;
    const timer = setInterval(() => {
      setCount((c) => {
        if (c >= total) {
          if (!holdRef.current) {
            holdRef.current = setTimeout(() => {
              holdRef.current = null;
              setCount(0);
            }, holdMs);
          }
          return c;
        }
        return c + 1;
      });
    }, speed);
    return () => {
      clearInterval(timer);
      if (holdRef.current) clearTimeout(holdRef.current);
    };
  }, [reduced, total, holdMs, speed]);

  let budget = count;
  return (
    <div className={className}>
      {lines.map((line, i) => {
        const shown = line.slice(0, Math.max(0, budget));
        const isTyping = budget > 0 && budget < line.length;
        budget -= line.length;
        const alert = line.startsWith(alertPrefix);
        return (
          <div key={i} className="whitespace-pre-wrap" style={{ color: alert ? "var(--accent)" : undefined }}>
            {shown.length > 0 && !alert && <span className="mr-1.5 text-accent">›</span>}
            {shown}
            {isTyping && <span className="caret ml-0.5 !h-[0.95em] !w-[0.45em]" />}
          </div>
        );
      })}
    </div>
  );
}

interface CycleWordProps {
  words: string[];
  className?: string;
  typeMs?: number;
  deleteMs?: number;
  holdMs?: number;
}

/** Types one word, holds, deletes it, types the next. The hero's rotator. */
export function CycleWord({ words, className, typeMs = 90, deleteMs = 45, holdMs = 1600 }: CycleWordProps) {
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [text, setText] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (reduced) {
      setText(words[0] ?? "");
      return;
    }
    const word = words[index % words.length] ?? "";

    if (!deleting && text === word) {
      const hold = setTimeout(() => setDeleting(true), holdMs);
      return () => clearTimeout(hold);
    }
    if (deleting && text === "") {
      setDeleting(false);
      setIndex((i) => (i + 1) % words.length);
      return;
    }
    const timer = setTimeout(
      () => setText((prev) => (deleting ? word.slice(0, prev.length - 1) : word.slice(0, prev.length + 1))),
      deleting ? deleteMs : typeMs,
    );
    return () => clearTimeout(timer);
  }, [text, deleting, index, words, reduced, typeMs, deleteMs, holdMs]);

  return (
    <span className={className} style={{ color: "var(--accent)" }}>
      {text}
      {!reduced && <span className="caret ml-[0.06em] !h-[0.72em] !w-[0.09em] align-baseline" />}
    </span>
  );
}

const DIVIDER_GLYPHS = "·─┼─·╌·┈─┼·╌┈·─·┼╌·┈─·";

/** A full-width strip of grid glyphs with a red pulse marching along it. */
export function AsciiDivider() {
  const reduced = useReducedMotion();
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (reduced) return;
    const timer = setInterval(() => setTick((t) => t + 1), 120);
    return () => clearInterval(timer);
  }, [reduced]);

  const reps = 6;
  const chars = DIVIDER_GLYPHS.repeat(reps).split("");
  const hot = tick % chars.length;

  return (
    <div aria-hidden className="overflow-hidden px-5 py-10 sm:px-8">
      <div className="mx-auto flex max-w-6xl justify-between font-mono text-[11px] leading-none text-grid-lo">
        {chars.map((ch, i) => {
          const d = Math.abs(i - hot);
          const lit = d < 4;
          return (
            <span key={i} className="hidden sm:inline" style={{ color: lit ? "var(--accent)" : undefined, opacity: lit ? 1 - d * 0.22 : undefined }}>
              {ch}
            </span>
          );
        })}
        <span className="sm:hidden">{DIVIDER_GLYPHS}</span>
      </div>
    </div>
  );
}
