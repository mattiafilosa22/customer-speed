import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Fail the production build on type errors (no silent escapes).
  // ESLint is run as a separate CI step (`pnpm lint`); Next 16 removed the
  // built-in `eslint` build integration.
  typescript: {
    ignoreBuildErrors: false,
  },
};

export default nextConfig;
