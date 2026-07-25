"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FALLBACK_REPOS } from "@/lib/fallback-repos";
import type { TeamProfile } from "@/lib/types";

type Phase = "input" | "loading" | "confirm";

export default function OnboardingPage() {
  const router = useRouter();
  const [repo, setRepo] = useState("");
  const [phase, setPhase] = useState<Phase>("input");
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<TeamProfile | null>(null);
  const [status, setStatus] = useState("Fetching repository…");

  async function runIndex(target: string) {
    setError(null);
    setPhase("loading");
    setStatus("Fetching repository metadata, README, and commits…");

    const statusTimer = window.setTimeout(() => {
      setStatus("Deriving team profile with Claude…");
    }, 1200);

    try {
      const res = await fetch("/api/index-repo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repo: target }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Indexing failed");
      setProfile(data.profile as TeamProfile);
      setPhase("confirm");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("input");
    } finally {
      window.clearTimeout(statusTimer);
    }
  }

  return (
    <main className="app-shell">
      <nav className="nav">
        <a className="active" href="/">
          Onboarding
        </a>
        <a href="/terminal">Terminal</a>
      </nav>

      <p className="brand">Roster</p>
      <h1>Calibrate from how your team actually builds.</h1>
      <p className="lede">
        Point Roster at a public GitHub repository. We index real README content
        and recent commits, then derive a team profile that shapes HQ from the
        first response.
      </p>

      {phase === "input" && (
        <section className="panel">
          <div className="row">
            <input
              type="text"
              placeholder="https://github.com/owner/repo or owner/repo"
              value={repo}
              onChange={(e) => setRepo(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && repo.trim()) void runIndex(repo);
              }}
            />
            <button
              className="primary"
              disabled={!repo.trim()}
              onClick={() => void runIndex(repo)}
            >
              Index repo
            </button>
          </div>

          <div className="cards">
            {FALLBACK_REPOS.map((r) => (
              <button
                key={r.fullName}
                className="card"
                type="button"
                onClick={() => {
                  setRepo(r.fullName);
                  void runIndex(r.fullName);
                }}
              >
                <strong>{r.fullName}</strong>
                <span>{r.blurb}</span>
              </button>
            ))}
          </div>
          {error && <p className="error">{error}</p>}
        </section>
      )}

      {phase === "loading" && (
        <section className="panel loading">
          <div className="spinner" aria-hidden />
          <p className="brand" style={{ margin: 0 }}>
            Live scan in progress
          </p>
          <p className="lede" style={{ margin: 0 }}>
            {status}
          </p>
          <p className="lede" style={{ margin: 0, fontFamily: "var(--mono)" }}>
            {repo}
          </p>
        </section>
      )}

      {phase === "confirm" && profile && (
        <section className="panel">
          <p className="brand">Derived team profile</p>
          <dl className="profile-grid">
            <div>
              <dt>Archetype</dt>
              <dd>{profile.archetype}</dd>
            </div>
            <div>
              <dt>Summary</dt>
              <dd>{profile.summary}</dd>
            </div>
            <div>
              <dt>Traits</dt>
              <dd>
                <ul className="traits">
                  {profile.traits.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              </dd>
            </div>
            <div>
              <dt>HQ directive</dt>
              <dd>{profile.directive}</dd>
            </div>
            <div>
              <dt>Source repo</dt>
              <dd style={{ fontFamily: "var(--mono)" }}>{profile.source_repo}</dd>
            </div>
          </dl>
          <div className="row" style={{ marginTop: "1.25rem" }}>
            <button className="primary" onClick={() => router.push("/terminal")}>
              Enter company terminal
            </button>
            <button className="ghost" onClick={() => setPhase("input")}>
              Index another repo
            </button>
          </div>
        </section>
      )}
    </main>
  );
}
