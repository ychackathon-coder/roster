import { z } from "zod";

/** One agent in a recommended roster. */
export const AgentSchema = z.object({
  /** Short job title, e.g. "Support Triage". */
  role: z.string().min(2).max(48),
  /** One sentence describing what this agent owns. */
  mandate: z.string().min(8).max(220),
  /** Two to five tool or surface names the agent works against. */
  tools: z.array(z.string().min(1).max(28)).min(1).max(6),
  /**
   * Role string of this agent's manager, or null for the top of the graph.
   * OrgGraph matches this against other agents' `role` values.
   */
  reportsTo: z.string().max(48).nullable(),
});

export type Agent = z.infer<typeof AgentSchema>;

export const CompanyProfileSchema = z.object({
  /** Display name of the company. */
  name: z.string().min(1).max(64),
  /** What the business does, one sentence. */
  summary: z.string().min(8).max(320),
  /** Sector label, e.g. "B2B SaaS". */
  industry: z.string().min(2).max(48),
  /** Three to six areas where agent leverage exists. */
  surfaces: z.array(z.string().min(1).max(60)).min(1).max(8),
});

export type CompanyProfile = z.infer<typeof CompanyProfileSchema>;

/** The complete roster payload the scan resolves to. */
export const ScanPayloadSchema = z.object({
  profile: CompanyProfileSchema,
  agents: z.array(AgentSchema).min(3).max(8),
});

export type ScanPayload = z.infer<typeof ScanPayloadSchema>;

/** How much of the pipeline actually succeeded. Drives terminal copy. */
export type ScanSource = "live" | "hostname-only" | "fallback";

/** What a scan resolves to. Always complete. */
export interface ScanResult extends ScanPayload {
  source: ScanSource;
  /** Deterministic lines the terminal can stream before the roster deals out. */
  notes: string[];
  /** Host if the input was a URL, else null. */
  host: string | null;
}

/** Client-side state machine for the scan. */
export type ScanState =
  | { status: "idle" }
  | { status: "scanning"; input: string; host: string | null }
  | { status: "ready"; input: string; result: ScanResult }
  | { status: "error"; input: string; message: string };
