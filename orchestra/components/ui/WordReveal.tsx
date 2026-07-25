"use client";

import { createElement, useEffect, useRef, useState, type ElementType } from "react";

import { useReducedMotion } from "@/lib/motion/useReducedMotion";

interface Props {
  text: string;
  as?: ElementType;
  className?: string;
  /** Milliseconds between words. */
  stagger?: number;
  delay?: number;
  /** Words matched here render in the accent. Keep it to one per headline. */
  accent?: string[];
  /** Wait until the element scrolls into view instead of revealing on mount. */
  onView?: boolean;
}

/**
 * Per-word reveal. Motion principles forbid per-letter fades on running text,
 * so every headline on the page goes through this.
 */
export function WordReveal({
  text,
  as: Tag = "span",
  className,
  stagger = 55,
  delay = 0,
  accent = [],
  onView = false,
}: Props) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLElement | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (reduced) {
      setShown(true);
      return;
    }

    if (!onView) {
      const frame = requestAnimationFrame(() => setShown(true));
      return () => cancelAnimationFrame(frame);
    }

    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setShown(true);
          observer.disconnect();
        }
      },
      { threshold: 0.25 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [onView, reduced]);

  const accentSet = new Set(accent.map((word) => word.toLowerCase()));
  const words = text.split(" ");

  const children = words.map((word, index) => (
    <span key={`${word}-${index}`} className="inline-block overflow-hidden align-bottom">
      <span
        className="inline-block"
        style={{
          color: accentSet.has(word.toLowerCase().replace(/[.,]/g, ""))
            ? "var(--accent)"
            : undefined,
          opacity: shown ? 1 : 0,
          transform: shown ? "translateY(0)" : "translateY(0.9em)",
          transition: reduced
            ? "none"
            : `opacity 900ms cubic-bezier(0.16,1,0.3,1) ${delay + index * stagger}ms, transform 900ms cubic-bezier(0.16,1,0.3,1) ${delay + index * stagger}ms`,
        }}
      >
        {word}
      </span>
      {index < words.length - 1 && <span>&nbsp;</span>}
    </span>
  ));

  // createElement rather than <Tag>: a polymorphic tag plus a ref is not
  // something TSX can narrow, and casting the element is worse than this.
  return createElement(Tag, { ref, className }, children);
}
