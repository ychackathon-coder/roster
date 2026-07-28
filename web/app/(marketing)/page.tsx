"use client";

import { useCallback, useState } from "react";

import { ActBrain } from "@/components/marketing/acts/ActBrain";
import { AsciiDivider } from "@/components/marketing/ui/Ascii";
import { ActHandoff } from "@/components/marketing/acts/ActHandoff";
import { ActMess } from "@/components/marketing/acts/ActMess";
import { ActScan } from "@/components/marketing/acts/ActScan";
import { FlowerBloom } from "@/components/marketing/canvas/FlowerBloom";
import { Hero } from "@/components/marketing/hero/Hero";
import { PillNav } from "@/components/marketing/nav/PillNav";
import { Loader } from "@/components/marketing/ui/Loader";
import { classifyInput, runLocalScan } from "@/components/marketing/lib/scan";
import type { ScanState } from "@/components/marketing/lib/types";

export default function Page() {
  const [state, setState] = useState<ScanState>({ status: "idle" });

  // The original app posted to /api/scan; this landing is static, so the demo
  // resolves entirely on the client against the sample roster.
  const onSubmit = useCallback(async (input: string) => {
    const classification = classifyInput(input);
    setState({
      status: "scanning",
      input,
      host: classification.kind === "url" ? classification.host : null,
    });

    try {
      const result = await runLocalScan(input);
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
