"use client";

import { useCallback, useEffect, useState } from "react";
import type { RosterEvent, TeamProfile } from "@/lib/types";
import { DEMO_MEMORY_REQUEST } from "@/lib/seed-data";

export default function TerminalPage() {
  const [events, setEvents] = useState<RosterEvent[]>([]);
  const [backend, setBackend] = useState<string>("");
  const [profile, setProfile] = useState<TeamProfile | null>(null);
  const [request, setRequest] = useState(DEMO_MEMORY_REQUEST);
  const [team, setTeam] = useState("Sales");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastHq, setLastHq] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [evRes, prRes] = await Promise.all([
      fetch("/api/events"),
      fetch("/api/profile"),
    ]);
    const ev = await evRes.json();
    const pr = await prRes.json();
    if (ev.events) setEvents(ev.events as RosterEvent[]);
    if (ev.backend) setBackend(ev.backend);
    setProfile(pr.profile ?? null);
  }, []);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), 2000);
    return () => window.clearInterval(id);
  }, [refresh]);

  async function sendRequest() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/hq", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request, team, user: "demo" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "HQ failed");
      setLastHq(data.terminal_line);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="app-shell">
      <nav className="nav">
        <a href="/">Onboarding</a>
        <a className="active" href="/terminal">
          Terminal
        </a>
      </nav>

      <p className="brand">Roster · live feed</p>
      <h1>Company terminal</h1>
      <p className="lede">
        Minimal mock of Person C&apos;s view. Events backend:{" "}
        <span style={{ fontFamily: "var(--mono)", color: "var(--accent)" }}>
          {backend || "…"}
        </span>
        {profile ? (
          <>
            {" "}
            · calibrated on{" "}
            <span style={{ fontFamily: "var(--mono)" }}>{profile.source_repo}</span> (
            {profile.archetype})
          </>
        ) : (
          <> · no active profile — complete onboarding first</>
        )}
      </p>

      <section className="panel" style={{ marginBottom: "1rem" }}>
        <div className="row">
          <select
            value={team}
            onChange={(e) => setTeam(e.target.value)}
            style={{
              background: "var(--bg)",
              color: "var(--ink)",
              border: "1px solid var(--line)",
              borderRadius: 8,
              padding: "0.85rem 1rem",
            }}
          >
            <option>Sales</option>
            <option>Ops</option>
            <option>HQ</option>
          </select>
          <input
            type="text"
            value={request}
            onChange={(e) => setRequest(e.target.value)}
            placeholder="Type a company request…"
          />
          <button
            className="primary"
            disabled={busy || !request.trim()}
            onClick={() => void sendRequest()}
          >
            {busy ? "Routing…" : "Send to HQ"}
          </button>
        </div>
        {lastHq && (
          <p style={{ marginTop: "0.85rem", fontFamily: "var(--mono)", color: "var(--accent)" }}>
            {lastHq}
          </p>
        )}
        {error && <p className="error">{error}</p>}
      </section>

      <section className="terminal" aria-live="polite">
        <div className="meta">
          # events ({events.length}) — newest first · poll 2s
        </div>
        {events.length === 0 && (
          <div className="line meta">No events yet. Seed or complete onboarding.</div>
        )}
        {events.map((e) => (
          <div key={e.id} className="line">
            <span className="meta">
              {new Date(e.timestamp).toLocaleString()} · {e.team}
              {e.user ? `/${e.user}` : ""}
            </span>
            {"\n"}
            <span className="accent">{e.terminal_line}</span>
            {"\n"}
            <span className="meta">
              req: {e.request} · {e.decision} → {e.sub_agent}
            </span>
          </div>
        ))}
      </section>
    </main>
  );
}
