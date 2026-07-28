"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";

import { WordReveal } from "@/components/marketing/ui/WordReveal";
import { useHorizontalPin } from "@/components/marketing/motion/useHorizontalPin";
import { useStaticLayout } from "@/components/marketing/motion/useReducedMotion";

const BrainSphere = dynamic(() => import("@/components/marketing/canvas/BrainSphere"), {
  ssr: false,
  loading: () => null,
});

const TRACK_VW = 220;

const FACTS = [
  ["Persistent", "Context survives the terminal. Close the window, the mandate stays."],
  ["Shared", "Every agent reads the same memory. Nothing is discovered twice."],
  ["Attributed", "Every claim has a session id and a human behind it."],
];

/** Act 4. The shared brain, rendered in WebGL, pinned and scrubbed. */
export function ActBrain() {
  const staticLayout = useStaticLayout();
  const progressRef = useRef(0);
  const [mounted, setMounted] = useState(false);

  const onProgress = useCallback((progress: number) => {
    progressRef.current = progress;
  }, []);

  const { sectionRef, trackRef } = useHorizontalPin<HTMLElement, HTMLDivElement>({
    disabled: staticLayout,
    lengthMultiplier: 1.2,
    onProgress,
  });

  // Mount the sphere right after hydration. It used to wait on an
  // IntersectionObserver sentinel, but the static/animated branch swap could
  // replace that sentinel after the observer attached, and the globe then
  // never rendered. next/dynamic already keeps Three.js out of the first
  // paint; that is enough laziness.
  useEffect(() => {
    setMounted(true);
  }, []);

  if (staticLayout) {
    return (
      <section id="brain" className="px-5 py-24 sm:px-8" aria-label="The brain">
        <div className="mx-auto max-w-3xl">
          <p className="mono-label mb-5">The brain</p>
          <h2 className="display display-lg text-balance">
            One memory, <span style={{ color: "var(--accent)" }}>shared</span> by every session.
          </h2>
          <p className="mono-sm mt-6 max-w-[46ch] text-fg-dim">
            Agents claim work against a common brain. What one learns, all of them know, and it is
            still there tomorrow.
          </p>
          <NodeGraph2D className="mt-10 h-[52vw] max-h-[320px] w-full" />
          <dl className="mt-10 space-y-6">
            {FACTS.map(([term, detail]) => (
              <div key={term}>
                <dt className="mono-label">{term}</dt>
                <dd className="mono-sm mt-1.5 text-fg-dim">{detail}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
    );
  }

  return (
    <section
      id="brain"
      ref={sectionRef}
      className="relative h-[100svh] overflow-hidden"
      aria-label="The brain"
    >
      {/* Sphere sits outside the track: the camera scrubs, the geometry stays centred. */}
      <div className="pointer-events-none absolute inset-0 z-0">
        {mounted && <BrainSphere progressRef={progressRef} />}
      </div>

      <div
        ref={trackRef}
        className="relative z-10 h-full"
        style={{ width: `${TRACK_VW}vw`, willChange: "transform" }}
      >
        <div className="absolute left-[5vw] top-1/2 w-[32vw] -translate-y-1/2">
          <p className="mono-label mb-5">The brain</p>
          <WordReveal
            as="h2"
            text="One memory, shared by every session."
            accent={["shared"]}
            className="display display-lg text-balance"
            onView
          />
          <p className="mono-sm mt-6 max-w-[36ch] text-fg-dim">
            Agents claim work against a common brain. What one learns, all of them know, and it is
            still there tomorrow morning.
          </p>
        </div>

        <div className="absolute left-[152vw] top-1/2 w-[26vw] -translate-y-1/2 space-y-8">
          {FACTS.map(([term, detail]) => (
            <div key={term} className="panel rounded-lg px-4 py-3.5">
              <p className="mono-label" style={{ color: "var(--accent)" }}>
                {term}
              </p>
              <p className="mono-sm mt-1.5 text-fg-dim">{detail}</p>
            </div>
          ))}
        </div>

        <div className="absolute left-[188vw] top-1/2 w-[26vw] -translate-y-1/2">
          <h3 className="display display-md text-balance">Nothing is discovered twice.</h3>
        </div>
      </div>
    </section>
  );
}

/**
 * Mobile and reduced-motion stand-in for the sphere. A 2D node graph on a
 * canvas: same idea, a fraction of the cost, and no WebGL context.
 */
function NodeGraph2D({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.floor(rect.width * dpr);
    canvas.height = Math.floor(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const radius = Math.min(cx, cy) * 0.82;
    const count = 34;

    const points = Array.from({ length: count }, (_, i) => {
      const angle = (i / count) * Math.PI * 2;
      const wobble = 0.62 + ((i * 37) % 40) / 100;
      return { x: cx + Math.cos(angle) * radius * wobble, y: cy + Math.sin(angle) * radius * wobble };
    });

    ctx.clearRect(0, 0, rect.width, rect.height);
    ctx.strokeStyle = "#2a2a2a";
    ctx.lineWidth = 1;

    for (let i = 0; i < points.length; i += 1) {
      for (let j = i + 1; j < points.length; j += 1) {
        const a = points[i]!;
        const b = points[j]!;
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (dist < radius * 0.55) {
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
    }

    points.forEach((point, i) => {
      const accent = i % 7 === 0;
      ctx.fillStyle = accent ? "#3d7cff" : "#8a8a8a";
      ctx.beginPath();
      ctx.arc(point.x, point.y, accent ? 3 : 1.8, 0, Math.PI * 2);
      ctx.fill();
    });
  }, []);

  return <canvas ref={ref} aria-hidden className={className} />;
}
