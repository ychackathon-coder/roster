"use client";

import { useLenisProvider } from "@/lib/motion/lenis";

/** Mount-only component. Owns the single Lenis instance for the whole page. */
export function SmoothScroll() {
  useLenisProvider();
  return null;
}
