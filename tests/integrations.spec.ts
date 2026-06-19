import { expect, test, type Page } from "@playwright/test";

/**
 * E2E for the Phase-6 feature-flag gating (docs/08 Fase 6, docs/00 §5).
 *
 * Fabio has `calendarIntegrations:false`, so the integrations section MUST NOT
 * appear and the sub-page MUST 404 (non-revealing). The real OAuth flow needs
 * live Google/Calendly credentials, so we deliberately do NOT drive a network
 * OAuth e2e (per the task) — only this "section absent for Fabio" check.
 *
 * Runs against the seeded Fabio tenant; credentials come from env (skips unset).
 */

const EMAIL = process.env.E2E_FABIO_EMAIL ?? "fabio@fabio.local";
const PASSWORD = process.env.E2E_FABIO_PASSWORD ?? process.env.SEED_FABIO_PASSWORD ?? "";

async function dismissCookieBanner(page: Page): Promise<void> {
  const reject = page.getByRole("button", { name: /rifiuta tutto|reject all/i });
  if (await reject.isVisible().catch(() => false)) {
    await reject.click();
    await reject.waitFor({ state: "hidden" });
  }
}

test.describe("integrations — hidden for Fabio (calendarIntegrations off)", () => {
  test.skip(PASSWORD.length === 0, "Set E2E_FABIO_PASSWORD / SEED_FABIO_PASSWORD to run.");
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async ({ page }) => {
    await page.goto("/login?org=fabio");
    await dismissCookieBanner(page);
    await page.getByLabel(/email/i).fill(EMAIL);
    await page.getByLabel(/password/i).fill(PASSWORD);
    await page.getByRole("button", { name: /accedi|sign in/i }).click();
    await page.waitForURL(/\/dashboard/);
  });

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
