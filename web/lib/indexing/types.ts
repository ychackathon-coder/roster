/** Raw material fetched from GitHub for profile derivation. */
export type { TeamProfile } from "@/lib/contracts";

export type RepoRawData = {
  fullName: string;
  url: string;
  description: string | null;
  language: string | null;
  topics: string[];
  stars: number;
  readme: string;
  commits: { sha: string; message: string; author: string | null; date: string | null }[];
};
