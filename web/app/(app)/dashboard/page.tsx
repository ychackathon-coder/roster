"use client";

/**
 * Product dashboard route. One LiveProvider, one poll, one consistent
 * snapshot for every panel inside <Dashboard/>. The heavy dashboard
 * stylesheet is scoped to this route group by importing it here.
 */
import "./dashboard.css";
import { LiveProvider } from "@/lib/live";
import { Dashboard } from "@/components/dashboard/dashboard";

export default function DashboardPage() {
  return (
    <LiveProvider>
      <Dashboard />
    </LiveProvider>
  );
}
