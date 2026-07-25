"use client";

/**
 * Live roster data, shared across the dashboard.
 *
 * A context rather than props because the components that need this data
 * (hierarchy, operations table, terminal, activity feed, metric tiles) sit at
 * different depths inside a 2,200-line component. Threading props through every
 * layer would touch far more of the UI than connecting data should.
 *
 * One poll drives every consumer, so the whole dashboard shows a single
 * consistent snapshot rather than each panel fetching on its own schedule.
 */
import { createContext, useContext, type ReactNode } from "react";
import { useRoster, type UseRosterResult } from "./use-roster";
import { MOCK_SNAPSHOT } from "./roster";

const RosterContext = createContext<UseRosterResult | null>(null);

export function RosterProvider({ children }: { children: ReactNode }) {
  const value = useRoster();
  return <RosterContext.Provider value={value}>{children}</RosterContext.Provider>;
}

/**
 * Never throws when used outside a provider — returns the mock snapshot instead.
 * A missing provider should degrade to the old static dashboard, not a blank
 * screen mid-demo.
 */
export function useRosterData(): UseRosterResult {
  const ctx = useContext(RosterContext);
  if (ctx) return ctx;
  return {
    ...MOCK_SNAPSHOT,
    loading: false,
    refresh: async () => {},
    submit: async () => null,
  };
}
