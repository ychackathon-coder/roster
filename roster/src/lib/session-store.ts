import { promises as fs } from "fs";
import path from "path";
import type { TeamProfile } from "./types";

const PROFILE_PATH = path.join(process.cwd(), "data", "active-profile.json");

export async function saveActiveProfile(profile: TeamProfile): Promise<void> {
  await fs.mkdir(path.dirname(PROFILE_PATH), { recursive: true });
  await fs.writeFile(
    PROFILE_PATH,
    JSON.stringify(profile, null, 2) + "\n",
    "utf8",
  );
}

export async function loadActiveProfile(): Promise<TeamProfile | null> {
  try {
    const raw = await fs.readFile(PROFILE_PATH, "utf8");
    return JSON.parse(raw) as TeamProfile;
  } catch {
    return null;
  }
}
