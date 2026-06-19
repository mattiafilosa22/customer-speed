import { test as setup, expect } from "@playwright/test";

import {
  FABIO_EMAIL,
  FABIO_PASSWORD,
  KPI_EMAIL,
  KPI_PASSWORD,
  STORAGE_STATE,
  SUPERADMIN_EMAIL,
  SUPERADMIN_PASSWORD,
  login,
} from "./support/auth";

/**
 * storageState setup (Fase 8 e2e hardening — docs/00 §5).
 *
 * The dev login is rate-limited per IP (docs/06 §6.1; the kill-switch is on for
 * the e2e server) and a cold server makes repeated UI logins slow/flaky. So we
 * log in ONCE per role here and persist the authenticated browser state; the
 * functional specs then reuse it via `test.use({ storageState })` and never log
 * in again. The login flow itself is still exercised end-to-end by
 * `auth-login.spec.ts`, which deliberately does NOT use a stored state.
 */

setup("authenticate as Fabio (proUser)", async ({ page }) => {
  setup.skip(FABIO_PASSWORD.length === 0, "Set E2E_FABIO_PASSWORD / SEED_FABIO_PASSWORD to run.");
  await login(page, FABIO_EMAIL, FABIO_PASSWORD, "fabio");
  await expect(page.getByRole("button", { name: /esci|sign out/i })).toBeVisible();
  await page.context().storageState({ path: STORAGE_STATE.fabio });
});

setup("authenticate as the read-only KPI tenant", async ({ page }) => {
  setup.skip(KPI_PASSWORD.length === 0, "Set E2E_FABIO_PASSWORD / SEED_FABIO_PASSWORD to run.");
  await login(page, KPI_EMAIL, KPI_PASSWORD, "kpidemo");
  await expect(page.getByRole("button", { name: /esci|sign out/i })).toBeVisible();
  await page.context().storageState({ path: STORAGE_STATE.kpi });
});

setup("authenticate as superAdmin", async ({ page }) => {
  setup.skip(
    SUPERADMIN_PASSWORD.length === 0,
    "Set E2E_SUPERADMIN_PASSWORD / SEED_SUPERADMIN_PASSWORD to run.",
  );
  // Login posts a redirect to /dashboard; the (app) layout forwards the
  // superAdmin to the cross-tenant /admin area (a superAdmin has no tenant
  // context for the tenant-scoped pages).
  await login(page, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD, undefined, /\/admin/);
  await expect(
    page.getByRole("heading", { name: /metriche globali|global metrics/i }),
  ).toBeVisible();
  await page.context().storageState({ path: STORAGE_STATE.superAdmin });
});
