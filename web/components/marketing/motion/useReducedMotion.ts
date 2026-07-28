"use client";

import { useEffect, useState } from "react";

/**
 * Single source of truth for every motion opt-out. Returns false during SSR and
 * the first client frame so markup matches, then corrects on mount.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);

    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return reduced;
}

/** True below the 768px breakpoint, where both pinned acts go vertical. */
export function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 767px)");
    setMobile(query.matches);

    const onChange = (event: MediaQueryListEvent) => setMobile(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return mobile;
}

/** Both opt-outs in one read: no pinning, no scrub, no canvas churn. */
export function useStaticLayout(): boolean {
  return useReducedMotion() || useIsMobile();
}
