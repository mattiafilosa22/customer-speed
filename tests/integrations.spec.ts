import { expect, test } from "@playwright/test";

import { FABIO_PASSWORD, STORAGE_STATE } from "./support/auth";

/**
 * E2E for the Phase-6 feature-flag gating (docs/08 Fase 6, docs/00 §5).
 *
 * Fabio has `calendarIntegrations:false`, so the integrations section MUST NOT
 * appear and the sub-page MUST 404 (non-revealing). The real OAuth flow needs
 * live Google/Calendly credentials, so we deliberately do NOT drive a network
 * OAuth e2e (per the task) — only this "section absent for Fabio" check.
 *
 * Runs against the seeded Fabio tenant; the authenticated session comes from the
 * `setup` project (storageState) — no per-spec login (Fase 8 e2e hardening).
 */

test.skip(FABIO_PASSWORD.length === 0, "Set E2E_FABIO_PASSWORD / SEED_FABIO_PASSWORD to run.");
test.use({ storageState: STORAGE_STATE.fabio });

test.describe("integrations — hidden for Fabio (calendarIntegrations off)", () => {
  test("the settings page does NOT show the integrations link", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(
      page.getByRole("link", { name: /gestisci le integrazioni|manage integrations/i }),
    ).toHaveCount(0);
  });

  test("the integrations sub-page is not found (flag off → 404)", async ({ page }) => {
    const response = await page.goto("/settings/integrations");
    expect(response?.status()).toBe(404);
  });
});
