"use client";

import { useEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";

import { useReducedMotion } from "@/lib/motion/useReducedMotion";

let lenis: Lenis | null = null;

export function getLenis(): Lenis | null {
  return lenis;
}

/** Scrolls to an element or offset through Lenis, falling back to native. */
export function scrollTo(target: string | number, offset = 0) {
  if (lenis) {
    lenis.scrollTo(target, { offset, duration: 1.4 });
    return;
  }
  if (typeof target === "number") {
    window.scrollTo({ top: target + offset, behavior: "smooth" });
    return;
  }
  document.querySelector(target)?.scrollIntoView({ behavior: "smooth" });
}

/**
 * Mounts the single Lenis instance and hands scroll driving to GSAP's ticker,
 * so smooth scroll and every ScrollTrigger read happen in one frame rather than
 * fighting across two rAF loops.
 */
export function useLenisProvider() {
  const reduced = useReducedMotion();

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);

    if (reduced) {
      // No smoothing at all; ScrollTrigger listens to native scroll on its own.
      ScrollTrigger.refresh();
      return;
    }

    const instance = new Lenis({
      duration: 1.15,
      easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      touchMultiplier: 1.6,
    });
    lenis = instance;

    const onScroll = () => ScrollTrigger.update();
    instance.on("scroll", onScroll);

    const tick = (time: number) => instance.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);

    ScrollTrigger.refresh();

    return () => {
      gsap.ticker.remove(tick);
      instance.off("scroll", onScroll);
      instance.destroy();
      lenis = null;
    };
  }, [reduced]);
}
