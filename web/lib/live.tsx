"use client";

/**
 * Live company data for the dashboard — one poll, one snapshot, every panel.
 *
 * The server does all mapping (/api/state returns render-ready shapes), so the
 * client stays dumb: poll, hold the latest snapshot, expose submit(). Everything
 * is org-scoped by the session cookie; there is nothing to configure here.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { StateSnapshot } from "./contracts";
import { supabaseBrowser } from "./supabase/browser";

const EMPTY: StateSnapshot = {
  org: null,
  profile: null,
  events: [],
  tasks: [],
  runners: [],
  operations: [],
  agents: [],
  activity: [],
  terminal: [],
  metrics: {
    activeAgents: 0,
    tasksCompleted: 0,
    interventionRate: 0,
    pendingApprovals: 0,
    runnersOnline: 0,
  },
};

export type LiveData = StateSnapshot & {
  /** False until the first successful poll — render skeletons, not zeros. */
  ready: boolean;
  /** True when the last poll failed; the snapshot shown may be stale. */
  stale: boolean;
  refresh: () => Promise<void>;
  /** Route a request through HQ. Returns HQ's terminal line, or null on failure. */
  submit: (request: string, team?: string) => Promise<string | null>;
};

const LiveContext = createContext<LiveData | null>(null);

export function LiveProvider({ children, pollMs = 3000 }: { children: ReactNode; pollMs?: number }) {
  const [snapshot, setSnapshot] = useState<StateSnapshot>(EMPTY);
  const [ready, setReady] = useState(false);
  const [stale, setStale] = useState(false);
  const alive = useRef(true);
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const res = await fetch("/api/state", { cache: "no-store" });
      if (res.status === 401) {
        // Session expired while the dashboard sat open — re-authenticate
        // rather than polling 401s forever behind a stale screen.
        window.location.assign("/login?next=/dashboard");
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      const next = (await res.json()) as StateSnapshot;
      if (alive.current) {
        setSnapshot(next);
        setReady(true);
        setStale(false);
      }
    } catch {
      if (alive.current) setStale(true);
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    alive.current = true;

    // Supabase access tokens expire hourly. Only pages that instantiate a
    // browser client get auto-refresh (it rewrites the auth cookie), and the
    // dashboard previously never did — so a dashboard left open for an hour
    // started 401ing until a manual reload. getSession() starts the refresh
    // timer; the subscription keeps it alive for the life of the provider.
    const supabase = supabaseBrowser();
    void supabase.auth.getSession();
    const { data: authSub } = supabase.auth.onAuthStateChange(() => {});

    void refresh();
    const timer = setInterval(() => void refresh(), pollMs);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive.current = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      authSub.subscription.unsubscribe();
    };
  }, [refresh, pollMs]);

  const submit = useCallback(
    async (request: string, team?: string): Promise<string | null> => {
      const trimmed = request.trim();
      if (!trimmed) return null;
      try {
        const res = await fetch("/api/hq", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ request: trimmed, ...(team ? { team } : {}) }),
        });
        if (!res.ok) return null;
        const body = (await res.json()) as { terminal_line?: string };
        await refresh();
        return body.terminal_line ?? null;
      } catch {
        return null;
      }
    },
    [refresh],
  );

  return (
    <LiveContext.Provider value={{ ...snapshot, ready, stale, refresh, submit }}>
      {children}
    </LiveContext.Provider>
  );
}

/** Safe outside a provider: returns the empty snapshot rather than throwing. */
export function useLive(): LiveData {
  const ctx = useContext(LiveContext);
  if (ctx) return ctx;
  return { ...EMPTY, ready: false, stale: false, refresh: async () => {}, submit: async () => null };
}
