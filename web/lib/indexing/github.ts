import type { RepoRawData } from "@/lib/indexing/types";

const GH_HEADERS = {
  Accept: "application/vnd.github+json",
  "User-Agent": "roster-person-d",
  "X-GitHub-Api-Version": "2022-11-28",
};

async function ghJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: GH_HEADERS, cache: "no-store" });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub ${res.status} for ${url}: ${body.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

async function fetchReadme(owner: string, name: string): Promise<string> {
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${name}/readme`,
    {
      headers: { ...GH_HEADERS, Accept: "application/vnd.github.raw+json" },
      cache: "no-store",
    },
  );
  if (!res.ok) return "(no README found)";
  const text = await res.text();
  // Cap to keep Claude prompt bounded
  return text.slice(0, 12000);
}

type GhRepo = {
  full_name: string;
  html_url: string;
  description: string | null;
  language: string | null;
  topics?: string[];
  stargazers_count: number;
};

type GhCommit = {
  sha: string;
  commit: {
    message: string;
    author: { name?: string; date?: string } | null;
  };
  author: { login?: string } | null;
};

/** Real public GitHub fetches: metadata + README + recent commits. */
export async function fetchRepoRaw(
  owner: string,
  name: string,
): Promise<RepoRawData> {
  const [repo, commits, readme] = await Promise.all([
    ghJson<GhRepo>(`https://api.github.com/repos/${owner}/${name}`),
    ghJson<GhCommit[]>(
      `https://api.github.com/repos/${owner}/${name}/commits?per_page=15`,
    ),
    fetchReadme(owner, name),
  ]);

  return {
    fullName: repo.full_name,
    url: repo.html_url,
    description: repo.description,
    language: repo.language,
    topics: repo.topics ?? [],
    stars: repo.stargazers_count,
    readme,
    commits: commits.map((c) => ({
      sha: c.sha.slice(0, 7),
      message: c.commit.message.split("\n")[0].slice(0, 200),
      author: c.author?.login ?? c.commit.author?.name ?? null,
      date: c.commit.author?.date ?? null,
    })),
  };
}
