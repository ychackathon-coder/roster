"use client";

/**
 * Live roster data for the dashboard, as a drop-in hook.
 *
 * Answers the handover's "poll or subscribe to Supabase Realtime?" question:
 * POLL, for now. Realtime needs the anon key in the browser and a second
 * client-side Supabase dependency, and the dashboard already reads through
 * roster's API. A 4s poll is indistinguishable on a projector and has one
 * failure mode instead of three. The swap is contained to this file if you want
 * Realtime later.
 *
 * USAGE — replace the mock imports in components/dashboard.tsx:
 *
 *   const { operations, agents, activity, terminal, metrics, profile, live } = useRoster();
 *
 * Before the first response, and whenever roster is unreachable, this returns
 * the existing mock data with `live: false`, so the UI never renders empty.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchSnapshot, sendToHq, MOCK_SNAPSHOT, type RosterSnapshot } from "./roster";

export type UseRosterResult = RosterSnapshot & {
  loading: boolean;
  /** Force a refresh — call after submitting to the terminal. */
  refresh: () => Promise<void>;
  /** Send a request to HQ, then refresh. Returns HQ's terminal line. */
  submit: (request: string, team?: string) => Promise<string | null>;
};

export function useRoster(pollMs = 4_000): UseRosterResult {
  const [snapshot, setSnapshot] = useState<RosterSnapshot>(MOCK_SNAPSHOT);
  const [loading, setLoading] = useState(true);
  // Guards against a slow response landing after unmount, and against two
  // in-flight polls fighting over state.
  const alive = useRef(true);
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const next = await fetchSnapshot();
      if (alive.current) setSnapshot(next);
    } finally {
      inFlight.current = false;
      if (alive.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    void refresh();

    const timer = setInterval(() => void refresh(), pollMs);

    // Refresh on tab focus: coming back to the dashboard should not show data
    // from before the laptop slept.
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      alive.current = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh, pollMs]);

  const submit = useCallback(
    async (request: string, team?: string): Promise<string | null> => {
      const trimmed = request.trim();
      if (!trimmed) return null;
      const result = await sendToHq({ request: trimmed, ...(team ? { team } : {}) });
      await refresh();
      return result?.terminal_line ?? null;
    },
    [refresh],
  );

  return { ...snapshot, loading, refresh, submit };
}
