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

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
