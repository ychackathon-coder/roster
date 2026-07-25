import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
};

// CORS for /api/* is handled in src/middleware.ts, not here. A static header can
// only name ONE allowed origin, and the dashboard runs on 3000 or 3001 depending
// on which port roster took — so the origin has to be echoed per request.
export default nextConfig;
