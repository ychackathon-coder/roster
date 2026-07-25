import { Dashboard } from "@/components/dashboard";
import { RosterProvider } from "@/lib/roster-context";

export default function Home() {
  // One provider, one poll, one consistent snapshot for every panel below.
  return (
    <RosterProvider>
      <Dashboard />
    </RosterProvider>
  );
}
