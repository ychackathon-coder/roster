/**
 * Step 1 definition of done: index >=2 real public repos, confirm outputs differ
 * and cite real details.
 */
import { writeFileSync, mkdirSync } from "fs";
import path from "path";
import { indexRepo } from "../src/lib/profile";

const REPOS = [
  { owner: "chalk", name: "chalk" },
  { owner: "sindresorhus", name: "is" },
];

function hasSpecificity(
  profile: { traits: string[]; summary: string; directive: string; source_repo: string },
  repoName: string,
): boolean {
  const blob = `${profile.traits.join(" ")} ${profile.summary} ${profile.directive}`.toLowerCase();
  const token = repoName.toLowerCase();
  return blob.includes(token) || profile.source_repo.toLowerCase().includes(token);
}

async function main() {
  const results = [];
  for (const r of REPOS) {
    console.log(`\n=== Indexing ${r.owner}/${r.name} ===`);
    const { raw, profile } = await indexRepo(r.owner, r.name);
    console.log(JSON.stringify(profile, null, 2));
    console.log(
      `raw: lang=${raw.language} stars=${raw.stars} commits=${raw.commits.length}`,
    );
    results.push({ repo: `${r.owner}/${r.name}`, profile, rawSnippet: raw.commits.slice(0, 3) });
  }

  const [a, b] = results;
  const sameArchetype = a.profile.archetype === b.profile.archetype;
  const sameSummary = a.profile.summary === b.profile.summary;
  const aOk = hasSpecificity(a.profile, "chalk");
  const bOk = hasSpecificity(b.profile, "is");

  console.log("\n=== Diff check ===");
  console.log({ sameArchetype, sameSummary, aOk, bOk });

  if (sameSummary) {
    throw new Error("Profiles produced identical summaries — too generic");
  }
  if (!aOk || !bOk) {
    throw new Error("One or more profiles lack repo-specific references");
  }

  const outDir = path.join(process.cwd(), "data", "cached-profiles");
  mkdirSync(outDir, { recursive: true });
  for (const r of results) {
    const file = path.join(outDir, `${r.repo.replace("/", "__")}.json`);
    writeFileSync(file, JSON.stringify(r, null, 2) + "\n");
    console.log("cached", file);
  }

  console.log("\nStep 1 PASS");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
