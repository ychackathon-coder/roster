"use client";

import { useEffect, useState } from "react";

import { scrollTo } from "@/lib/motion/lenis";

const LINKS = [
  { label: "Scan", target: "#scan" },
  { label: "The mess", target: "#mess" },
  { label: "The brain", target: "#brain" },
  { label: "Start", target: "#handoff" },
];

const COLLAPSE_AT = 80;

/**
 * Two pills at rest, one centred pill once scrolled. Anchors only, because
 * Phase 1 is a single route.
 */
export function PillNav() {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const onScroll = () => setCollapsed(window.scrollY > COLLAPSE_AT);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const go = (target: string) => (event: React.MouseEvent) => {
    event.preventDefault();
    scrollTo(target, -24);
  };

  return (
    <nav
      aria-label="Sections"
      className="pointer-events-none fixed inset-x-0 top-0 z-50 px-4 pt-4 sm:px-6 sm:pt-6"
    >
      <div
        className="mx-auto flex items-center transition-all duration-[400ms] ease-out"
        style={{
          maxWidth: collapsed ? "min(640px, 100%)" : "100%",
          gap: collapsed ? "0.35rem" : "1rem",
          justifyContent: collapsed ? "center" : "flex-end",
        }}
      >
        <div
          className="pointer-events-auto flex items-center gap-1 rounded-full p-1 transition-all duration-[400ms] ease-out"
          style={{
            background: "var(--panel)",
            border: "1px solid var(--hairline)",
            backdropFilter: "blur(18px)",
          }}
        >
          {LINKS.map((link) => (
            <a
              key={link.target}
              href={link.target}
              onClick={go(link.target)}
              className="rounded-full px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-fg-dim transition-colors duration-200 hover:bg-white/[0.06] hover:text-fg"
            >
              {link.label}
            </a>
          ))}
        </div>
      </div>
    </nav>
  );
}
