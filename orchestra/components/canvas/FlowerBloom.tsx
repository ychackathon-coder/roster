"use client";

// The hero background: a real flower photo re-rendered live as a soft halftone
// of dots (the letscolab / dataism vibe), which never sits still — it keeps
// crumbling, shedding particles that flow across the frame and dissolve, so the
// flower is always alive and drifting behind the type. We sample a source image
// on a grid, drop the black background, grade each lit cell toward cool blue,
// and paint it as a breathing dot; a steady stream of those dots detaches and
// flows off to the side.
//
// All state lives in refs and one rAF loop; React never re-renders per frame,
// and the loop parks itself offscreen or when the tab is hidden.

import { useEffect, useRef } from "react";

import { useReducedMotion } from "@/lib/motion/useReducedMotion";

export type FieldMode = "flow" | "converge";

interface Props {
  /** `converge` cools the whole flower toward pure blue for the scan. */
  mode?: FieldMode;
  className?: string;
}

const SRC = "/flower-src.png";
const CELL = 12; // grid pitch, px — small enough for a fine halftone
const MOBILE_CELL = 16;
const LUM_MIN = 26; // below this the source is background: no dot
const MAX_CRUMBS = 260;

// Palette, raw rgb. Cream highlight → soft blue → deep blue, plus a warm heart.
const WHITE = [248, 246, 240];
const CREAM = [223, 224, 219];
const BLUE_SOFT = [140, 184, 255];
const BLUE = [61, 124, 255];
const BLUE_DEEP = [46, 86, 176];
const GOLD = [236, 190, 110];

interface Dot {
  x: number;
  y: number;
  rgb: number[];
  /** Base radius, from source brightness — the halftone weight. */
  rad: number;
  seed: number;
  /** Countdown until this dot crumbles off and flows away. */
  cool: number;
}

interface Crumb {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rgb: number[];
  rad: number;
  life: number;
}

const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);

export function FlowerBloom({ mode = "flow", className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const modeRef = useRef<FieldMode>(mode);
  const reduced = useReducedMotion();

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    const isMobile = window.matchMedia("(max-width: 767px)").matches;
    const cell = isMobile ? MOBILE_CELL : CELL;

    let width = 0;
    let height = 0;
    let dots: Dot[] = [];
    const crumbs: Crumb[] = [];
    let appear = 0; // one-time fade-in of the whole flower

    const sampler = document.createElement("canvas");
    const sctx = sampler.getContext("2d", { willReadFrequently: true })!;
    const img = new Image();
    let imgReady = false;

    const grade = (lum: number, warm: boolean, cool: number): number[] => {
      // Bright, blue-forward. Cream only at the very brightest highlights, a
      // little gold in the warm heart, everything else graded through blue.
      if (lum > 214) return WHITE;
      if (warm && cool < 0.36 && lum > 150) return GOLD;
      if (lum > 150) return BLUE_SOFT;
      if (lum > 96) return BLUE;
      return BLUE_DEEP;
    };

    const build = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      dots = [];
      if (!imgReady) return;

      // Fit the source into a box that fills the hero, preserving the flower's
      // aspect. It sits high so the headline rides its petals and the glass
      // pill floats over the stem — the reference composition.
      const aspect = img.width / img.height;
      const flowerH = Math.min(height * 0.8, (width * 0.74) / aspect);
      const dispW = flowerH * aspect;
      const cx = width * 0.5;
      const top = height * 0.05;

      const cols = Math.max(8, Math.floor(dispW / cell));
      const rows = Math.max(8, Math.floor(flowerH / cell));
      sampler.width = cols;
      sampler.height = rows;
      sctx.clearRect(0, 0, cols, rows);
      sctx.drawImage(img, 0, 0, cols, rows);
      const data = sctx.getImageData(0, 0, cols, rows).data;
      const left = cx - dispW / 2;

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const i = (r * cols + c) * 4;
          const R = data[i]!;
          const G = data[i + 1]!;
          const B = data[i + 2]!;
          const lum = 0.2126 * R + 0.7152 * G + 0.0722 * B;
          if (lum < LUM_MIN) continue;
          const warm = R > B + 26 && R > 120;
          const cool = clamp01((B - R) / 90 + 0.5);
          dots.push({
            x: left + c * cell + cell / 2,
            y: top + r * cell + cell / 2,
            rgb: grade(lum, warm, cool),
            rad: (0.28 + 0.34 * (lum / 255)) * cell,
            seed: Math.random() * 7,
            cool: 200 + ((Math.random() * 1600) | 0),
          });
        }
      }
    };

    let pointerX = 0;
    let pointerY = 0;
    let parX = 0;
    let parY = 0;
    const onPointer = (e: PointerEvent) => {
      pointerX = (e.clientX / width - 0.5) * 16;
      pointerY = (e.clientY / height - 0.5) * 16;
    };

    const drawFrame = (now: number) => {
      const time = now / 1000;
      const converge = modeRef.current === "converge";
      appear = Math.min(1, appear + 0.012);

      parX += (pointerX - parX) * 0.05;
      parY += (pointerY - parY) * 0.05;

      ctx.fillStyle = "#0a0a0a";
      ctx.fillRect(0, 0, width, height);

      // --- the flower, as breathing halftone dots ---
      for (let i = 0; i < dots.length; i++) {
        const d = dots[i]!;
        const breath = 0.7 + 0.3 * Math.sin(time * 1.4 + d.seed);
        let r = d.rgb[0]!;
        let g = d.rgb[1]!;
        let b = d.rgb[2]!;
        if (converge) {
          r = (r + BLUE[0]) / 2;
          g = (g + BLUE[1]) / 2;
          b = (b + BLUE[2]) / 2;
        }
        const alpha = clamp01(0.66 + 0.34 * breath) * appear;
        const px = d.x + parX * (0.6 + d.rad * 0.05);
        const py = d.y + parY * (0.6 + d.rad * 0.05);
        ctx.fillStyle = `rgba(${r},${g},${b},${alpha.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(px, py, d.rad * (0.9 + 0.18 * breath), 0, Math.PI * 2);
        ctx.fill();

        // Crumble: when a dot's timer expires it sheds a particle that flows
        // off across the frame, then the timer resets — a flower that never
        // stops drifting apart at its edges.
        if (appear > 0.6 && --d.cool <= 0) {
          d.cool = 700 + ((Math.random() * 1800) | 0);
          if (crumbs.length < MAX_CRUMBS) {
            crumbs.push({
              x: px,
              y: py,
              vx: 0.5 + Math.random() * 1.4, // flow across, to the right
              vy: -0.35 - Math.random() * 0.6, // and gently up
              rgb: d.rgb,
              rad: d.rad,
              life: 1,
            });
          }
        }
      }

      // --- crumbs flowing across ---
      for (let i = crumbs.length - 1; i >= 0; i--) {
        const p = crumbs[i]!;
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 1.004; // accelerate away
        p.life -= 0.0055;
        if (p.life <= 0 || p.x > width + 20) {
          crumbs.splice(i, 1);
          continue;
        }
        const a = clamp01(p.life) * 0.7 * appear;
        ctx.fillStyle = `rgba(${p.rgb[0]},${p.rgb[1]},${p.rgb[2]},${a.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(p.x + parX, p.y + parY, p.rad * (0.5 + 0.5 * p.life), 0, Math.PI * 2);
        ctx.fill();
      }
    };

    let frame = 0;
    let running = false;
    const loop = (now: number) => {
      drawFrame(now);
      frame = requestAnimationFrame(loop);
    };
    const start = () => {
      if (running || reduced) return;
      running = true;
      frame = requestAnimationFrame(loop);
    };
    const stop = () => {
      if (!running) return;
      running = false;
      cancelAnimationFrame(frame);
    };

    img.onload = () => {
      imgReady = true;
      build();
      if (reduced) {
        appear = 1;
        ctx.fillStyle = "#0a0a0a";
        ctx.fillRect(0, 0, width, height);
        drawFrame(0);
      } else {
        start();
      }
    };
    img.src = SRC;

    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(0, 0, width, height);

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
      resizeTimer = setTimeout(build, 180);
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
