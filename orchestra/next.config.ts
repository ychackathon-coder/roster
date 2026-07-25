import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The home directory above this project also has a lockfile; pin the root so
  // Turbopack does not infer it.
  turbopack: { root: import.meta.dirname },
};

export default nextConfig;
