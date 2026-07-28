import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Roster — your AI workforce",
  description:
    "Index your repo, calibrate an HQ, and put real coding agents to work — with every decision and edit visible live.",
};

/**
 * Root layout is deliberately bare. Each route group owns its look:
 *   (marketing)  landing — its own fonts and css
 *   (app)        product — dashboard/onboarding css
 * so the heavy dashboard stylesheet never loads on the landing page and vice
 * versa.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
