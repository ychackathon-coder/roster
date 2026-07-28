"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import "../onboarding/onboarding.css";

export default function JoinPage() {
  const router = useRouter();

  const [code, setCode] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function join() {
    if (!code.trim() || !displayName.trim() || joining) return;
    setError(null);
    setJoining(true);
    try {
      const res = await fetch("/api/orgs/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: code.trim(),
          display_name: displayName.trim(),
        }),
      });
      const data = await res.json();
      if (data?.redirect) {
        router.push(data.redirect as string);
        return;
      }
      if (!res.ok) {
        throw new Error(data?.error || "That invite code didn't match a company. Check it and try again.");
      }
      router.push("/dashboard");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setJoining(false);
    }
  }

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
          <a href="/onboarding">Onboarding</a>
          <a className="active" href="/join">
            Join
          </a>
        </nav>

        <p className="onb-brand">Roster</p>
        <h1 className="onb-h1">Join your company.</h1>
        <p className="onb-lede">
          Enter the invite code a teammate shared with you and pick a display name. You&apos;ll
          land in the company dashboard, already calibrated to how your team builds.
        </p>

        <section className="onb-panel">
          <div className="onb-field">
            <label className="onb-label" htmlFor="join-code">
              Invite code
            </label>
            <input
              id="join-code"
              className="onb-input onb-mono"
              type="text"
              placeholder="e.g. QK7-4FN2"
              value={code}
              autoFocus
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => setCode(e.target.value)}
            />
          </div>
          <div className="onb-field">
            <label className="onb-label" htmlFor="join-display">
              Your display name
            </label>
            <input
              id="join-display"
              className="onb-input"
              type="text"
              placeholder="Ada"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void join();
              }}
            />
          </div>
          <div className="onb-row">
            <button
              className="onb-primary"
              disabled={!code.trim() || !displayName.trim() || joining}
              onClick={() => void join()}
            >
              {joining ? "Joining…" : "Join company"}
            </button>
          </div>
          {error && <p className="onb-error">{error}</p>}
          <p className="onb-hint">
            No invite code? <a href="/onboarding">Create a company instead</a>.
          </p>
        </section>
      </div>
    </main>
  );
}
