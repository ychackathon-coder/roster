"use client";

import { useCallback, useState } from "react";

import { ActBrain } from "@/components/acts/ActBrain";
import { AsciiDivider } from "@/components/ui/Ascii";
import { ActHandoff } from "@/components/acts/ActHandoff";
import { ActMess } from "@/components/acts/ActMess";
import { ActScan } from "@/components/acts/ActScan";
import { FlowerBloom } from "@/components/canvas/FlowerBloom";
import { Hero } from "@/components/hero/Hero";
import { PillNav } from "@/components/nav/PillNav";
import { Loader } from "@/components/ui/Loader";
import { classifyInput } from "@/lib/scan/classifyInput";
import type { ScanResult, ScanState } from "@/lib/types";

export default function Page() {
  const [state, setState] = useState<ScanState>({ status: "idle" });

  const onSubmit = useCallback(async (input: string) => {
    const classification = classifyInput(input);
    setState({
      status: "scanning",
      input,
      host: classification.kind === "url" ? classification.host : null,
    });

    try {
      const response = await fetch("/api/scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ input }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "The scan could not be started.");
      }

      const result = (await response.json()) as ScanResult;
      setState({ status: "ready", input, result });
    } catch (error) {
      setState({
        status: "error",
        input,
        message: error instanceof Error ? error.message : "The scan failed. Try again.",
      });
    }
  }, []);

  const fieldMode = state.status === "idle" || state.status === "error" ? "flow" : "converge";

  return (
    <>
      <Loader />
      <PillNav />

      <main>
        {/* The glyph field sticks through Act 1 and Act 2, then scrolls away so
            it stops painting once the pinned acts take over. */}
        <div className="relative">
          <div className="pointer-events-none absolute inset-0 z-0">
            <FlowerBloom mode={fieldMode} className="sticky top-0 block h-screen w-screen" />
          </div>

          <div className="relative z-10">
            <Hero state={state} onSubmit={onSubmit} />
            <ActScan state={state} />
          </div>
        </div>

        <ActMess />
        <AsciiDivider />
        <ActBrain />
        <AsciiDivider />
        <ActHandoff />
      </main>
    </>
  );
}
