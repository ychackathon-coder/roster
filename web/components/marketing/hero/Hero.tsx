"use client";

import { CycleWord, Spinner, TypeLines } from "@/components/marketing/ui/Ascii";
import { ScanPill } from "@/components/marketing/hero/ScanPill";
import { WordReveal } from "@/components/marketing/ui/WordReveal";
import type { ScanState } from "@/components/marketing/lib/types";

interface Props {
  state: ScanState;
  onSubmit: (input: string) => void;
}

/** Act 1. The headline is the LCP element, so it renders as plain text. */
export function Hero({ state, onSubmit }: Props) {
  const busy = state.status === "scanning";
  const error = state.status === "error" ? state.message : null;

  return (
    <section
      id="top"
      className="relative flex min-h-[100svh] flex-col items-center justify-center px-5 pb-24 pt-28 sm:px-8"
    >
      <div className="flex w-full max-w-4xl flex-col items-center text-center">
        <h1 className="display display-xl display-tall max-w-[16ch] text-balance">
          <WordReveal as="span" text="Work made" className="block" />
          <CycleWord words={["better.", "faster.", "efficient.", "easy."]} className="block" />
        </h1>

        <p className="mono-sm mt-8 max-w-[52ch] text-fg-dim">
          Ten people, forty terminals, nobody knows who is working on what. ORCHESTRA gives every
          session an owner, a mandate, and a brain that outlives the window.
        </p>

        <div className="mt-11 flex w-full justify-center">
          <ScanPill busy={busy} error={error} onSubmit={onSubmit} />
        </div>

        <div className="mt-8 flex items-center gap-2.5 font-mono text-[12px] text-fg-dim">
          <Spinner />
          <TypeLines
            lines={[busy ? "reading the org, hold on" : "40 terminals open · 0 owners assigned · fix that"]}
            speed={34}
            holdMs={3600}
          />
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-6 flex justify-center">
        <span className="mono-label">Scroll</span>
      </div>
    </section>
  );
}
