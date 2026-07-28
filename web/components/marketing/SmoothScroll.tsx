"use client";

import { useLenisProvider } from "@/components/marketing/motion/lenis";

/** Mount-only component. Owns the single Lenis instance for the whole page. */
export function SmoothScroll() {
  useLenisProvider();
  return null;
}
