import { defineConfig, devices } from "@playwright/test";

const PORT = 3000;
const baseURL = `http://localhost:${PORT}`;

/**
 * Playwright e2e config. Tests live in `tests/`. The web server is started by
 * Playwright itself against a production build so smoke checks are realistic.
 *
 * Project layout (Fase 8 e2e hardening):
 *   - `setup` runs `auth.setup.ts` ONCE and persists a per-role authenticated
 *     storageState (Fabio, the read-only KPI tenant, superAdmin). Functional
 *     specs depend on it and reuse the session via `test.use({ storageState })`
 *     instead of logging in repeatedly (avoids per-IP login pressure + cold-
 *     server timeouts).
 *   - `chromium` runs the desktop suite.
 *   - `mobile` runs only the responsive specs (`*.mobile.spec.ts`) on a phone
 *     viewport (drawer/cards). It also depends on `setup`.
 *
 * The login flow ITSELF is still exercised end-to-end by `auth-login.spec.ts`,
 * which does not consume a stored state.
 */
export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: "chromium",
      testIgnore: /\.mobile\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup"],
    },
    {
      name: "mobile",
      testMatch: /\.mobile\.spec\.ts/,
      use: { ...devices["Pixel 7"] },
      dependencies: ["setup"],
    },
  ],
  webServer: {
    command: "pnpm build && pnpm start",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    /**
     * Disable the auth rate limiter for the e2e run so the suite can submit the
     * login form repeatedly without tripping the per-IP limit (Fase 8 hardening,
     * docs/06 §6.1). This sets the kill-switch ONLY for the started server; the
     * env layer forbids it in production (`NODE_ENV=production`), so we keep
     * NODE_ENV unset here (it defaults to development in `pnpm start` only for
     * the runtime — the build is still a production build) and pass the flag.
     *
     * Note: we deliberately do NOT export NODE_ENV=development for the build.
     */
    env: {
      // E2E=true is the explicit signal that lets RATE_LIMIT_DISABLED through the
      // production fail-safe (the harness runs a production build). A real
      // deployment never sets E2E.
      E2E: "true",
      RATE_LIMIT_DISABLED: "true",
    },
  },
});
