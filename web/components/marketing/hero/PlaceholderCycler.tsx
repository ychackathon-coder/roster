"use client";

import { useEffect, useState } from "react";

import { PLACEHOLDER_EXAMPLES } from "@/components/marketing/lib/data";
import { useReducedMotion } from "@/components/marketing/motion/useReducedMotion";

interface Props {
  /** Cycling pauses while the field is focused or holds a value. */
  paused: boolean;
}

const TYPE_MS = 55;
const DELETE_MS = 26;
const HOLD_MS = 1700;

/**
 * Types and deletes through example inputs behind the real field. Rendered as a
 * sibling rather than a `placeholder` attribute so the caret can animate; the
 * input keeps a real `placeholder` for assistive tech, hidden via CSS.
 */
export function PlaceholderCycler({ paused }: Props) {
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [text, setText] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (paused) return;

    const phrase = PLACEHOLDER_EXAMPLES[index % PLACEHOLDER_EXAMPLES.length]!;

    if (reduced) {
      setText(phrase);
      return;
    }

    if (!deleting && text === phrase) {
      const hold = setTimeout(() => setDeleting(true), HOLD_MS);
      return () => clearTimeout(hold);
    }

    if (deleting && text === "") {
      setDeleting(false);
      setIndex((prev) => (prev + 1) % PLACEHOLDER_EXAMPLES.length);
      return;
    }

    const timer = setTimeout(
      () =>
        setText((prev) =>
          deleting ? phrase.slice(0, prev.length - 1) : phrase.slice(0, prev.length + 1),
        ),
      deleting ? DELETE_MS : TYPE_MS,
    );
    return () => clearTimeout(timer);
  }, [text, deleting, index, paused, reduced]);

  if (paused) return null;

  return (
    <span aria-hidden className="pointer-events-none absolute inset-y-0 left-0 flex items-center">
      <span className="truncate font-mono text-base text-fg-dim sm:text-lg">{text}</span>
      <span className="caret ml-1 !h-[1em] !w-[0.5em]" />
    </span>
  );
}
