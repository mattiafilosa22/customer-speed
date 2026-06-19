import { expect, test } from "@playwright/test";

import { FABIO_PASSWORD, STORAGE_STATE, SUPERADMIN_PASSWORD } from "./support/auth";

/**
 * E2E for the Phase-7 critical flow (docs/08 roadmap, docs/00 §5): the
 * cross-tenant ADMIN area + its guard.
 *
 *  1. the superAdmin reaches `/admin`, sees the global metrics and the tenant
 *     list (with the seeded `customerspeed` + `fabio` tenants),
 *  2. a proUser (Fabio) is REJECTED from `/admin` — the layout guard redirects
 *     ordinary users to `/dashboard` (the admin area is not even revealed).
 *
 * Each block reuses the relevant role's storageState from the `setup` project
 * (no per-test UI login — Fase 8 e2e hardening). The suite skips when the role's
 * password is unset.
 */

test.describe("admin area — superAdmin access", () => {
  test.skip(
    SUPERADMIN_PASSWORD.length === 0,
    "Set E2E_SUPERADMIN_PASSWORD / SEED_SUPERADMIN_PASSWORD to run.",
  );
  test.use({ storageState: STORAGE_STATE.superAdmin });

  test("superAdmin reaches /admin and sees global metrics + the tenant list", async ({ page }) => {
    await page.goto("/admin");
    await expect(
      page.getByRole("heading", { name: /metriche globali|global metrics/i }),
    ).toBeVisible();

    await page.goto("/admin/tenants");
    await expect(page.getByRole("heading", { name: /^(tenant|tenants)$/i })).toBeVisible();
    // The seeded tenants appear by slug (exact cell match avoids matching the
    // tenant NAME "Fabio Consulting").
    await expect(page.getByRole("cell", { name: "fabio", exact: true })).toBeVisible();
    await expect(page.getByRole("cell", { name: "customerspeed", exact: true })).toBeVisible();
  });
});

test.describe("admin area — non-superAdmin rejected", () => {
  test.skip(FABIO_PASSWORD.length === 0, "Set E2E_FABIO_PASSWORD / SEED_FABIO_PASSWORD to run.");
  test.use({ storageState: STORAGE_STATE.fabio });

  test("a proUser hitting /admin is redirected to the dashboard", async ({ page }) => {
    await page.goto("/admin");
    // The layout guard bounces ordinary users to /dashboard (admin not revealed).
    await page.waitForURL(/\/dashboard/);
    await expect(
      page.getByRole("heading", { name: /metriche globali|global metrics/i }),
    ).toHaveCount(0);
  });
});
