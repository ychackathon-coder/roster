import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FlowOS — AI Workforce Command Center",
  description: "Monitor, coordinate, and supervise your AI workforce.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
