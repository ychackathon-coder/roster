import type { NextConfig } from "next";

/**
 * Proxy /api/* through to the roster app.
 *
 * WHY THIS RATHER THAN CALLING ROSTER DIRECTLY FROM THE BROWSER:
 *
 * NEXT_PUBLIC_* values are read by the BROWSER, so pointing the dashboard at
 * roster directly means baking an address into client code. On one laptop that is
 * "localhost:3456" — which breaks the instant a teammate opens the dashboard from
 * their own machine, because their browser resolves localhost to THEIR computer,
 * where nothing is listening. It also requires CORS.
 *
 * Proxying fixes both. The browser only ever talks to the origin it loaded from,
 * so the dashboard behaves identically at localhost:3001 and at
 * 192.168.12.30:3001, with no CORS and no per-machine configuration.
 *
 * ROSTER_INTERNAL_URL is resolved SERVER-side, so 127.0.0.1 is correct whenever
 * both apps run on the same host. Point it elsewhere for split deployments.
 */
const rosterUrl = (process.env.ROSTER_INTERNAL_URL ?? "http://127.0.0.1:3456").replace(/\/$/, "");

const nextConfig: NextConfig = {
  reactStrictMode: true,

  async rewrites() {
    return [
      // This dashboard defines no /api routes of its own, so forwarding the whole
      // namespace is safe. Revisit if that changes.
      { source: "/api/:path*", destination: `${rosterUrl}/api/:path*` },
    ];
  },
};

export default nextConfig;
