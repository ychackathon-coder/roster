import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import localFont from "next/font/local";

import { SmoothScroll } from "@/components/marketing/SmoothScroll";
import "./marketing.css";

const robotoSerif = localFont({
  src: [
    { path: "../fonts/RobotoSerif-Variable.ttf", style: "normal" },
    { path: "../fonts/RobotoSerif-Italic-Variable.ttf", style: "italic" },
  ],
  variable: "--font-roboto-serif",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ORCHESTRA — manage your agent workforce",
  description:
    "Every Claude Code session gets an owner, a mandate, and a persistent brain. Paste your company site and see the agent roster you should be running.",
  openGraph: {
    title: "ORCHESTRA",
    description:
      "Every session gets an owner, a mandate, and a persistent brain. Scan your company, get your roster.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
  colorScheme: "dark",
};

/**
 * The marketing group cannot own <html>, so the font variables and the design
 * tokens ride on a `.mkt` wrapper instead. Everything the landing renders,
 * including its fixed nav and loader plate, lives inside this subtree.
 */
export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className={`mkt ${GeistSans.variable} ${GeistMono.variable} ${robotoSerif.variable}`}>
      <SmoothScroll />
      {children}
    </div>
  );
}
