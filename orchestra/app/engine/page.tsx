import type { Metadata } from "next";

import TeamGlobe from "@/components/engine/TeamGlobe";

export const metadata: Metadata = {
  title: "TEAM ENGINE — ORCHESTRA",
  description:
    "A living map of the team: every action grows a node into its owner's web, every employee grows a memory the company keeps.",
};

export default function EnginePage() {
  return <TeamGlobe />;
}
