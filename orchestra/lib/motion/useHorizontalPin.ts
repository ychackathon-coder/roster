"use client";

import { useEffect, useRef, type RefObject } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

interface Options {
  /** Skipped entirely on mobile and under reduced motion. */
  disabled: boolean;
  /**
   * Extra scroll distance as a multiple of the horizontal travel. Higher feels
   * slower and gives the inner scrubs more room.
   */
  lengthMultiplier?: number;
  /** Called every frame with 0..1 track progress, for inner choreography. */
  onProgress?: (progress: number) => void;
}

interface Result<S extends HTMLElement, T extends HTMLElement> {
  sectionRef: RefObject<S | null>;
  trackRef: RefObject<T | null>;
}

/**
 * Pins a section and translates its wide inner track sideways as the user
 * scrolls down. Shared by Act 3 and Act 4 so both releases behave identically.
 */
export function useHorizontalPin<S extends HTMLElement, T extends HTMLElement>({
  disabled,
  lengthMultiplier = 1,
  onProgress,
}: Options): Result<S, T> {
  const sectionRef = useRef<S | null>(null);
  const trackRef = useRef<T | null>(null);

  // Kept in a ref so a changing callback never tears down the ScrollTrigger.
  const progressRef = useRef(onProgress);
  progressRef.current = onProgress;

  useEffect(() => {
    const section = sectionRef.current;
    const track = trackRef.current;
    if (disabled || !section || !track) return;

    gsap.registerPlugin(ScrollTrigger);

    const context = gsap.context(() => {
      // Read fresh on every refresh so resizes recompute the travel distance.
      const travel = () => Math.max(0, track.scrollWidth - window.innerWidth);

      const tween = gsap.to(track, {
        x: () => -travel(),
        ease: "none",
        scrollTrigger: {
          trigger: section,
          start: "top top",
          end: () => `+=${travel() * lengthMultiplier + window.innerHeight * 0.5}`,
          pin: true,
          scrub: 1,
          anticipatePin: 1,
          invalidateOnRefresh: true,
          onUpdate: (self) => progressRef.current?.(self.progress),
        },
      });

      return () => {
        tween.scrollTrigger?.kill();
        tween.kill();
      };
    }, section);

    return () => context.revert();
  }, [disabled, lengthMultiplier]);

  return { sectionRef, trackRef };
}
