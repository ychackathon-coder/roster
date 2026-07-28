"use client";

import Link from "next/link";

import { WordReveal } from "@/components/marketing/ui/WordReveal";

/**
 * Act 5. Static by design: the closing CTA is the one door into the product,
 * so it routes to /login rather than scrolling back to the demo pill.
 */
export function ActHandoff() {
  return (
    <section
      id="handoff"
      className="relative flex min-h-[100svh] flex-col items-center justify-center px-5 py-28 text-center sm:px-8"
      aria-label="Get started"
    >
      <p className="mono-label mb-7">Next</p>

      <WordReveal
        as="h2"
        text="Put your workforce on the record."
        accent={["record."]}
        className="display display-xl max-w-[14ch] text-balance"
        onView
      />

      <p className="mono-sm mt-8 max-w-[50ch] text-fg-dim">
        Onboarding registers your company and issues one join code. Everyone on your team pastes it
        into their terminal once, and every session they open from then on shows up in the roster
        with an owner and a mandate.
      </p>

      <Link
        href="/login"
        className="mt-11 rounded-full px-8 py-4 font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-canvas transition-transform duration-300 hover:scale-[1.02]"
        style={{ background: "var(--accent)" }}
      >
        Start onboarding
      </Link>

      <p className="mono-label mt-6">Takes about six seconds</p>

      <footer className="mono-label absolute inset-x-0 bottom-8 flex flex-col items-center gap-1">
        <span>ORCHESTRA</span>
        <span style={{ color: "var(--grid-lo)" }}>Agent workforce management</span>
      </footer>
    </section>
  );
}
