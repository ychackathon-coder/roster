"use client";

import { useEffect, useMemo, useRef } from "react";

import { OrgGraph } from "@/components/marketing/ui/OrgGraph";
import { Terminal } from "@/components/marketing/ui/Terminal";
import { classifyInput } from "@/components/marketing/lib/scan";
import { scrollTo } from "@/components/marketing/motion/lenis";
import type { ScanState } from "@/components/marketing/lib/types";

interface Props {
  state: ScanState;
}

const SOURCE_NOTE: Record<string, string> = {
  live: "roster derived from your live site",
  "hostname-only": "site unreachable, roster inferred from the domain",
  fallback: "static preview, this is a sample roster",
};

/**
 * Act 2. Never navigates and never dead-ends: the terminal opens with lines
 * computed locally from the input, so there is something to read the instant
 * the user hits submit.
 */
export function ActScan({ state }: Props) {
  const sectionRef = useRef<HTMLElement | null>(null);
  const scrolled = useRef(false);

  const lines = useMemo(() => buildLines(state), [state]);

  // Pull the viewport to the reveal once, on the first submit of a session.
  useEffect(() => {
    if (state.status !== "scanning" || scrolled.current) return;
    scrolled.current = true;
    const timer = setTimeout(() => scrollTo("#reveal", -80), 420);
    return () => clearTimeout(timer);
  }, [state.status]);

  if (state.status === "idle") return null;

  const result = state.status === "ready" ? state.result : null;

  return (
    <section
      id="reveal"
      ref={sectionRef}
      className="relative z-10 px-5 py-24 sm:px-8 sm:py-32"
      aria-label="Scan result"
    >
      <div className="mx-auto w-full max-w-6xl">
        <Terminal
          lines={lines}
          busy={state.status === "scanning"}
          label={state.status === "error" ? "scan / failed" : "scan"}
          className="mx-auto max-w-3xl"
        />

        {result && (
          <div className="mt-20">
            <div className="mb-10 flex flex-col items-center gap-3 text-center">
              <p className="mono-label">Recommended roster</p>
              <h2 className="display display-md max-w-[20ch] text-balance">
                {result.profile.name}
              </h2>
              <p className="mono-sm max-w-[56ch] text-fg-dim">{result.profile.summary}</p>
            </div>

            <OrgGraph agents={result.agents} />

            <p className="mono-label mt-10 text-center">
              {SOURCE_NOTE[result.source] ?? SOURCE_NOTE.fallback}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * Append-only by construction: the first two lines are computed with the same
 * rules the scan runner uses, so the streamed prefix never has to be rewritten.
 */
function buildLines(state: ScanState): string[] {
  if (state.status === "idle") return [];

  const input = state.input;
  const classification = classifyInput(input);
  const host = classification.kind === "url" ? classification.host : null;

  const local = [
    host
      ? `target ${host}`
      : `target free-form description, ${input.trim().split(/\s+/).length} words`,
    `classified as ${classification.kind === "url" ? "website" : "description"}`,
  ];

  if (state.status === "scanning") {
    return [...local, "opening scan channel", "reading what this business actually does"];
  }

  if (state.status === "error") {
    return [...local, state.message, "nothing was sent, try again"];
  }

  const { result } = state;
  return [
    ...local,
    ...result.notes.slice(2),
    `identified ${result.profile.name}, ${result.profile.industry}`,
    `leverage found in ${result.profile.surfaces.join(", ")}`,
    `assigning ${result.agents.length} agents, one owner per lane`,
  ];
}
