import type { NextConfig } from "next";

/**
 * One app, one origin. The hackathon's proxy/CORS layer is gone on purpose —
 * onboarding, dashboard, and API all live here, so the browser never makes a
 * cross-origin call.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  // three.js examples ship untranspiled ESM.
  transpilePackages: ["three"],
};

export default nextConfig;
