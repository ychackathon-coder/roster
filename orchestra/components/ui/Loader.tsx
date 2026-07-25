"use client";

import { useEffect, useRef, useState } from "react";

import { useReducedMotion } from "@/lib/motion/useReducedMotion";

const WORD = "ORCHESTRA";
const CHARSET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&/\\<>";
const DURATION_MS = 1200;
const CYCLE_MS = 50; // ~20 glyph swaps per second
const SESSION_KEY = "orchestra:loader-seen";

/**
 * Act 0. Each character scrambles until its slot resolves, left to right, then
 * the whole plate lifts. Runs at most once per session and never under reduced
 * motion, so it can never become an obstacle between the user and the hero.
 */
export function Loader() {
  const reduced = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  const [active, setActive] = useState(false);
  const [lifting, setLifting] = useState(false);
  const [glyphs, setGlyphs] = useState<string[]>(() => WORD.split(""));
  const resolvedRef = useRef(0);

  // Decide on the client only: sessionStorage is not readable during SSR, and
  // rendering the plate server-side would flash it for returning visitors.
  useEffect(() => {
    setMounted(true);
    if (sessionStorage.getItem(SESSION_KEY)) return;
    sessionStorage.setItem(SESSION_KEY, "1");
    setActive(true);
  }, []);

  useEffect(() => {
    if (!active || reduced) return;

    document.body.style.overflow = "hidden";
    const started = performance.now();

    const interval = setInterval(() => {
      const progress = Math.min(1, (performance.now() - started) / DURATION_MS);
      const resolvedCount = Math.floor(progress * WORD.length);
      resolvedRef.current = resolvedCount;

      setGlyphs(
        WORD.split("").map((letter, index) =>
          index < resolvedCount
            ? letter
            : CHARSET[(Math.random() * CHARSET.length) | 0]!,
        ),
      );
    }, CYCLE_MS);

    const finish = setTimeout(() => {
      clearInterval(interval);
      setGlyphs(WORD.split(""));
      setLifting(true);
      document.body.style.overflow = "";
      setTimeout(() => setActive(false), 700);
    }, DURATION_MS);

    return () => {
      clearInterval(interval);
      clearTimeout(finish);
      document.body.style.overflow = "";
    };
  }, [active, reduced]);

  if (!mounted || !active || reduced) return null;

  return (
    <div
      aria-hidden
      className="fixed inset-0 z-[100] flex items-center justify-center bg-canvas transition-[transform,opacity] duration-700 ease-out"
      style={{
        transform: lifting ? "translateY(-101%)" : "translateY(0)",
        opacity: lifting ? 0.4 : 1,
      }}
    >
      <div className="flex items-baseline gap-[0.06em] font-mono text-[clamp(1.6rem,7vw,4.5rem)] font-medium tracking-[0.06em] text-fg">
        {glyphs.map((glyph, index) => (
          <span
            key={index}
            className="inline-block text-center"
            style={{
              width: "1ch",
              color: index < resolvedRef.current ? "var(--fg)" : "var(--grid-hi)",
            }}
          >
            {glyph}
          </span>
        ))}
        <span className="caret ml-[0.15em]" />
      </div>
    </div>
  );
}
