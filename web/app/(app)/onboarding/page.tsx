"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Org, TeamProfile } from "@/lib/contracts";
import "./onboarding.css";

type Step = "company" | "repo" | "indexing" | "confirm";

type OrgSummary = Pick<Org, "id" | "name" | "invite_code">;

const EXAMPLE_REPOS = [
  {
    fullName: "chalk/chalk",
    blurb: "Tiny terminal styling library — fast, focused commits.",
  },
  {
    fullName: "expressjs/express",
    blurb: "Fast, unopinionated web framework — long-lived stable core.",
  },
  {
    fullName: "vercel/next.js",
    blurb: "The React framework — high-velocity monorepo at scale.",
  },
];

const STEP_LABELS = ["Create your company", "Calibrate from your repo", "Confirmed"];

function stepIndex(step: Step): number {
  if (step === "company") return 0;
  if (step === "confirm") return 2;
  return 1;
}

export default function OnboardingPage() {
  const router = useRouter();

  const [step, setStep] = useState<Step>("company");

  // Step 1 — company
  const [companyName, setCompanyName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [org, setOrg] = useState<OrgSummary | null>(null);

  // Step 2 — repo indexing
  const [repo, setRepo] = useState("");
  const [indexError, setIndexError] = useState<string | null>(null);
  const [status, setStatus] = useState("Fetching repository metadata, README, and commits…");
  const [elapsed, setElapsed] = useState(0);
  const [profile, setProfile] = useState<TeamProfile | null>(null);

  // Step 3 — invite code copy
  const [copied, setCopied] = useState(false);

  const timersRef = useRef<number[]>([]);
  const tickRef = useRef<number | null>(null);
  const copyResetRef = useRef<number | null>(null);

  function clearTimers() {
    for (const t of timersRef.current) window.clearTimeout(t);
    timersRef.current = [];
    if (tickRef.current !== null) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }

  useEffect(() => {
    return () => {
      clearTimers();
      if (copyResetRef.current !== null) window.clearTimeout(copyResetRef.current);
    };
  }, []);

  async function createCompany() {
    if (!companyName.trim() || !displayName.trim() || creating) return;
    setCreateError(null);
    setCreating(true);
    try {
      const res = await fetch("/api/orgs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: companyName.trim(),
          display_name: displayName.trim(),
        }),
      });
      const data = await res.json();
      if (data?.redirect) {
        // Already in a company — the API tells us where to go.
        router.push(data.redirect as string);
        return;
      }
      if (!res.ok) throw new Error(data?.error || "Could not create the company");
      setOrg(data.org as OrgSummary);
      setStep("repo");
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  }

  async function runIndex(target: string) {
    const value = target.trim();
    if (!value) return;
    setRepo(value);
    setIndexError(null);
    setStep("indexing");
    setElapsed(0);
    setStatus("Fetching repository metadata, README, and commits…");

    clearTimers();
    timersRef.current.push(
      window.setTimeout(() => {
        setStatus("Reading how the team actually builds — commits, README, topics…");
      }, 7000),
      window.setTimeout(() => {
        setStatus("Deriving the team profile with Claude — this can take up to a minute…");
      }, 18000),
    );
    tickRef.current = window.setInterval(() => setElapsed((s) => s + 1), 1000);

    try {
      const res = await fetch("/api/index-repo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repo: value }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Indexing failed");
      setProfile(data.profile as TeamProfile);
      setStep("confirm");
    } catch (e) {
      setIndexError(e instanceof Error ? e.message : String(e));
      setStep("repo");
    } finally {
      clearTimers();
    }
  }

  async function copyCode() {
    if (!org) return;
    try {
      await navigator.clipboard.writeText(org.invite_code);
      setCopied(true);
      if (copyResetRef.current !== null) window.clearTimeout(copyResetRef.current);
      copyResetRef.current = window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable — the code itself is select-all on click.
    }
  }

  const active = stepIndex(step);
  const progress = Math.min(94, 6 + elapsed * 1.5);

  const heading =
    step === "company"
      ? "Create your company."
      : step === "confirm"
        ? "Your company is calibrated."
        : "Calibrate from how your team actually builds.";

  const lede =
    step === "company"
      ? "Name the company and yourself. Next, Roster calibrates HQ from a real repository your team ships."
      : step === "confirm"
        ? "HQ now speaks your team's language. Share the invite code below to bring teammates in."
        : "Point Roster at a public GitHub repository. We index real README content and recent commits, then derive a team profile that shapes HQ from the first response.";

  return (
    <main className="onb-shell">
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        rel="stylesheet"
        precedence="default"
        href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&display=swap"
      />

      <div className="onb-main">
        <nav className="onb-nav">
          <a className="active" href="/onboarding">
            Onboarding
          </a>
          <a href="/join">Join</a>
        </nav>

        <p className="onb-brand">Roster</p>
        <h1 className="onb-h1">{heading}</h1>
        <p className="onb-lede">{lede}</p>

        <ol className="onb-steps">
          {STEP_LABELS.map((label, i) => (
            <li key={label} className={i === active ? "active" : i < active ? "done" : ""}>
              <span>0{i + 1}</span>
              <span>{label}</span>
            </li>
          ))}
        </ol>

        {step === "company" && (
          <section className="onb-panel">
            <div className="onb-field">
              <label className="onb-label" htmlFor="onb-company">
                Company name
              </label>
              <input
                id="onb-company"
                className="onb-input"
                type="text"
                placeholder="Acme Robotics"
                value={companyName}
                autoFocus
                onChange={(e) => setCompanyName(e.target.value)}
              />
            </div>
            <div className="onb-field">
              <label className="onb-label" htmlFor="onb-display">
                Your display name
              </label>
              <input
                id="onb-display"
                className="onb-input"
                type="text"
                placeholder="Ada"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void createCompany();
                }}
              />
            </div>
            <div className="onb-row">
              <button
                className="onb-primary"
                disabled={!companyName.trim() || !displayName.trim() || creating}
                onClick={() => void createCompany()}
              >
                {creating ? "Creating…" : "Create company"}
              </button>
            </div>
            {createError && <p className="onb-error">{createError}</p>}
            <p className="onb-hint">
              Have an invite code? <a href="/join">Join an existing company instead</a>.
            </p>
          </section>
        )}

        {step === "repo" && (
          <section className="onb-panel">
            <div className="onb-row">
              <input
                className="onb-input"
                type="text"
                placeholder="https://github.com/owner/repo or owner/repo"
                value={repo}
                autoFocus
                onChange={(e) => setRepo(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && repo.trim()) void runIndex(repo);
                }}
              />
              <button
                className="onb-primary"
                disabled={!repo.trim()}
                onClick={() => void runIndex(repo)}
              >
                Index repo
              </button>
            </div>

            <div className="onb-cards">
              {EXAMPLE_REPOS.map((r) => (
                <button
                  key={r.fullName}
                  className="onb-card"
                  type="button"
                  onClick={() => void runIndex(r.fullName)}
                >
                  <strong>{r.fullName}</strong>
                  <span>{r.blurb}</span>
                </button>
              ))}
            </div>

            {indexError && (
              <div className="onb-error-row">
                <p className="onb-error">{indexError}</p>
                <button
                  className="onb-ghost onb-retry"
                  type="button"
                  disabled={!repo.trim()}
                  onClick={() => void runIndex(repo)}
                >
                  Retry
                </button>
              </div>
            )}
          </section>
        )}

        {step === "indexing" && (
          <section className="onb-panel onb-loading">
            <div className="onb-spinner" aria-hidden />
            <p className="onb-brand" style={{ margin: 0 }}>
              Live scan in progress
            </p>
            <p className="onb-lede" style={{ margin: 0 }}>
              {status}
            </p>
            <p className="onb-lede onb-mono" style={{ margin: 0 }}>
              {repo}
            </p>
            <div className="onb-progress" role="progressbar" aria-label="Indexing progress">
              <span style={{ width: `${progress}%` }} />
            </div>
            <p className="onb-elapsed">{elapsed}s — reading the repo, hang tight</p>
          </section>
        )}

        {step === "confirm" && profile && (
          <section className="onb-panel">
            <p className="onb-brand">Derived team profile</p>
            <dl className="onb-profile-grid">
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
                  <ul className="onb-traits">
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
                <dd className="onb-mono">{profile.source_repo}</dd>
              </div>
            </dl>

            <div className="onb-invite">
              <p className="onb-label">Invite code</p>
              <div className="onb-invite-row">
                <code className="onb-invite-code">{org?.invite_code ?? "—"}</code>
                <button className="onb-ghost" type="button" onClick={() => void copyCode()}>
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <p className="onb-invite-note">
                Teammates join at <code>/join</code> with this code.
              </p>
            </div>

            <div className="onb-row" style={{ marginTop: "1.25rem" }}>
              <button className="onb-primary" onClick={() => router.push("/dashboard")}>
                Enter your company
              </button>
              <button
                className="onb-ghost"
                onClick={() => {
                  setIndexError(null);
                  setStep("repo");
                }}
              >
                Re-index another repo
              </button>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
