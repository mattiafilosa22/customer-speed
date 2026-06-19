import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Fail the production build on type errors (no silent escapes).
  // ESLint is run as a separate CI step (`pnpm lint`); Next 16 removed the
  // built-in `eslint` build integration.
  typescript: {
    ignoreBuildErrors: false,
  },
};

// Wires next-intl into the build: points it at the request config
// (./src/i18n/request.ts by default) and enables the typed-messages support.
const withNextIntl = createNextIntlPlugin();

export default withNextIntl(nextConfig);
