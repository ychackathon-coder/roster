"use client";

import { useEffect, useRef } from "react";

import { useReducedMotion } from "@/lib/motion/useReducedMotion";

export type FieldMode = "flow" | "converge";

interface Props {
  /** `converge` pulls every glyph onto a spherical shell at centre. */
  mode?: FieldMode;
  className?: string;
}

const CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789/\\|<>[]{}=+*-.:";
const MAX_PARTICLES = 1800;
const MOBILE_PARTICLES = 420;
const AREA_PER_PARTICLE = 1_500;
const CONVERGE_MS = 900;

/** Static brightness tiers. Bucketing by colour keeps fillStyle changes to six per frame. */
const TIERS = [
  { color: "#242424", size: 10 },
  { color: "#333333", size: 11 },
  { color: "#4a4a4a", size: 11 },
  { color: "#6b6b6b", size: 12 },
  { color: "#8a8a8a", size: 12 },
];
const ACCENT_TIER = { color: "#3d7cff", size: 12 };
const ACCENT_SHARE = 0.02;

interface Particle {
  x: number;
  y: number;
  /** Home position on the converged shell, resolved per resize. */
  sx: number;
  sy: number;
  speed: number;
  char: string;
  /** Frames until this glyph reshuffles. */
  churn: number;
}

/**
 * Full-viewport flow field of mono glyphs. Everything lives in refs: React
 * never re-renders this component per frame, and the loop parks itself the
 * moment the canvas is offscreen or the tab is hidden.
 */
export function GlyphField({ mode = "flow", className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const modeRef = useRef<FieldMode>(mode);
  const convergeStartRef = useRef<number | null>(null);
  const reduced = useReducedMotion();

  // Mode is read inside the loop rather than closed over, so switching it does
  // not tear down and rebuild the particle set mid-animation.
  useEffect(() => {
    if (mode === "converge" && modeRef.current !== "converge") {
      convergeStartRef.current = performance.now();
    }
    if (mode === "flow") convergeStartRef.current = null;
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    const isMobile = window.matchMedia("(max-width: 767px)").matches;
    let width = 0;
    let height = 0;
    let dpr = 1;

    const particles: Particle[] = [];
    const buckets: number[][] = TIERS.map(() => []);
    const accentBucket: number[] = [];

    const build = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);

      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.textBaseline = "middle";

      const target = isMobile
        ? MOBILE_PARTICLES
        : Math.min(MAX_PARTICLES, Math.floor((width * height) / AREA_PER_PARTICLE));

      particles.length = 0;
      buckets.forEach((b) => (b.length = 0));
      accentBucket.length = 0;

      // Shell radius for converge mode, sized to sit inside the terminal panel.
      const radius = Math.min(width, height) * 0.34;
      const cx = width / 2;
      const cy = height / 2;

      for (let i = 0; i < target; i += 1) {
        // Fibonacci-ish distribution so the converged shell reads as a sphere
        // rather than a ring: latitude is arccos-spaced, then projected.
        const t = (i + 0.5) / target;
        const phi = Math.acos(1 - 2 * t);
        const theta = Math.PI * (1 + Math.sqrt(5)) * i;
        const shellR = radius * Math.sin(phi);

        particles.push({
          x: Math.random() * width,
          y: Math.random() * height,
          sx: cx + Math.cos(theta) * shellR,
          sy: cy + Math.cos(phi) * radius * 0.72,
          speed: 0.28 + Math.random() * 0.72,
          char: CHARSET[(Math.random() * CHARSET.length) | 0]!,
          churn: (Math.random() * 90) | 0,
        });

        if (Math.random() < ACCENT_SHARE) accentBucket.push(i);
        else buckets[(Math.random() * TIERS.length) | 0]!.push(i);
      }
    };

    build();

    /** Layered sines stand in for curl noise: smooth, seamless, and cheap. */
    const angleAt = (x: number, y: number, t: number) =>
      (Math.sin(x * 0.0034 + t * 0.11) +
        Math.cos(y * 0.0041 - t * 0.09) +
        Math.sin((x + y) * 0.0021 + t * 0.06)) *
      1.35;

    let pointerX = 0;
    let pointerY = 0;
    let parallaxX = 0;
    let parallaxY = 0;

    const onPointer = (event: PointerEvent) => {
      pointerX = (event.clientX / width - 0.5) * 26;
      pointerY = (event.clientY / height - 0.5) * 26;
    };

    const drawFrame = (now: number) => {
      const time = now / 1000;
      const convergeStart = convergeStartRef.current;
      const pull = convergeStart
        ? Math.min(1, (now - convergeStart) / CONVERGE_MS)
        : 0;
      // Ease the pull so the collapse decelerates onto the shell.
      const eased = pull === 0 ? 0 : 1 - Math.pow(1 - pull, 3);

      parallaxX += (pointerX - parallaxX) * 0.045;
      parallaxY += (pointerY - parallaxY) * 0.045;

      // Trail rather than a hard clear: this is what makes the streams read.
      ctx.fillStyle = eased > 0 ? "rgba(10,10,10,0.20)" : "rgba(10,10,10,0.13)";
      ctx.fillRect(0, 0, width, height);

      for (let i = 0; i < particles.length; i += 1) {
        const p = particles[i]!;

        if (eased > 0) {
          p.x += (p.sx - p.x) * 0.055 * eased;
          p.y += (p.sy - p.y) * 0.055 * eased;
          // Slow orbital drift once seated, so the shell never looks frozen.
          const swirl = angleAt(p.x, p.y, time * 0.4);
          p.x += Math.cos(swirl) * 0.25 * (1 - eased * 0.75);
          p.y += Math.sin(swirl) * 0.25 * (1 - eased * 0.75);
        } else {
          const angle = angleAt(p.x, p.y, time);
          p.x += Math.cos(angle) * p.speed;
          p.y += Math.sin(angle) * p.speed;

          if (p.x < -20) p.x = width + 20;
          else if (p.x > width + 20) p.x = -20;
          if (p.y < -20) p.y = height + 20;
          else if (p.y > height + 20) p.y = -20;
        }

        p.churn -= 1;
        if (p.churn <= 0) {
          p.char = CHARSET[(Math.random() * CHARSET.length) | 0]!;
          p.churn = 40 + ((Math.random() * 110) | 0);
        }
      }

      for (let t = 0; t < TIERS.length; t += 1) {
        const tier = TIERS[t]!;
        ctx.fillStyle = tier.color;
        ctx.font = `${tier.size}px var(--font-geist-mono), ui-monospace, monospace`;
        const bucket = buckets[t]!;
        for (let b = 0; b < bucket.length; b += 1) {
          const p = particles[bucket[b]!]!;
          ctx.fillText(p.char, p.x + parallaxX, p.y + parallaxY);
        }
      }

      ctx.fillStyle = ACCENT_TIER.color;
      ctx.font = `${ACCENT_TIER.size}px var(--font-geist-mono), ui-monospace, monospace`;
      for (let a = 0; a < accentBucket.length; a += 1) {
        const p = particles[accentBucket[a]!]!;
        ctx.fillText(p.char, p.x + parallaxX * 1.6, p.y + parallaxY * 1.6);
      }
    };

    // Reduced motion: one composed frame, then stop. No loop, no listeners.
    if (reduced) {
      ctx.fillStyle = "#0a0a0a";
      ctx.fillRect(0, 0, width, height);
      for (let i = 0; i < 24; i += 1) drawFrame(performance.now() + i * 16);
      return;
    }

    let frame = 0;
    let running = false;

    const loop = (now: number) => {
      drawFrame(now);
      frame = requestAnimationFrame(loop);
    };

    const start = () => {
      if (running) return;
      running = true;
      frame = requestAnimationFrame(loop);
    };

    const stop = () => {
      if (!running) return;
      running = false;
      cancelAnimationFrame(frame);
    };

    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(0, 0, width, height);
    start();

    const observer = new IntersectionObserver(
      ([entry]) => (entry?.isIntersecting ? start() : stop()),
      { threshold: 0 },
    );
    observer.observe(canvas);

    const onVisibility = () => (document.hidden ? stop() : start());
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pointermove", onPointer, { passive: true });

    let resizeTimer: ReturnType<typeof setTimeout>;
    const onResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        build();
        ctx.fillStyle = "#0a0a0a";
        ctx.fillRect(0, 0, width, height);
      }, 180);
    };
    window.addEventListener("resize", onResize);

    return () => {
      stop();
      observer.disconnect();
      clearTimeout(resizeTimer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("resize", onResize);
    };
  }, [reduced]);

  return <canvas ref={canvasRef} aria-hidden className={className} />;
}
