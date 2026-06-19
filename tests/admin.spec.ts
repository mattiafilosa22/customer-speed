import { expect, test, type Page } from "@playwright/test";

/**
 * E2E for the Phase-7 critical flow (docs/08 roadmap, docs/00 §5): the
 * cross-tenant ADMIN area.
 *
 *  1. the superAdmin logs in and reaches `/admin`, sees the global metrics and
 *     the tenant list (with the seeded `customerspeed` + `fabio` tenants),
 *  2. a proUser (Fabio) is REJECTED from `/admin` — the layout guard redirects
 *     ordinary users to `/dashboard` (the admin area is not even revealed).
 *
 * Credentials come from env; the suite skips when unset. The superAdmin lives in
 * the demo tenant (seeded); Fabio is the proUser.
 */

const SUPERADMIN_EMAIL = process.env.E2E_SUPERADMIN_EMAIL ?? "admin@customerspeed.local";
const SUPERADMIN_PASSWORD =
  process.env.E2E_SUPERADMIN_PASSWORD ?? process.env.SEED_SUPERADMIN_PASSWORD ?? "";

const FABIO_EMAIL = process.env.E2E_FABIO_EMAIL ?? "fabio@fabio.local";
const FABIO_PASSWORD = process.env.E2E_FABIO_PASSWORD ?? process.env.SEED_FABIO_PASSWORD ?? "";

async function dismissCookieBanner(page: Page): Promise<void> {
  const reject = page.getByRole("button", { name: /rifiuta tutto|reject all/i });
  if (await reject.isVisible().catch(() => false)) {
    await reject.click();
    await reject.waitFor({ state: "hidden" });
  }
}

async function login(page: Page, email: string, password: string, org?: string): Promise<void> {
  await page.goto(org ? `/login?org=${org}` : "/login");
  await dismissCookieBanner(page);
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /accedi|sign in/i }).click();
}

test.describe("admin area — superAdmin access", () => {
  test.skip(
    SUPERADMIN_PASSWORD.length === 0,
    "Set E2E_SUPERADMIN_PASSWORD / SEED_SUPERADMIN_PASSWORD to run.",
  );

  test("superAdmin reaches /admin and sees global metrics + the tenant list", async ({ page }) => {
    await login(page, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD);
    // Wait for the post-login navigation so the session cookie is committed
    // before we navigate to the admin area.
    await page.waitForURL(/\/dashboard/);
    await page.goto("/admin");

    await expect(page.getByRole("heading", { name: /metriche globali|global metrics/i })).toBeVisible();

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

  test("a proUser hitting /admin is redirected to the dashboard", async ({ page }) => {
    await login(page, FABIO_EMAIL, FABIO_PASSWORD, "fabio");
    await page.waitForURL(/\/dashboard/);

    await page.goto("/admin");
    // The layout guard bounces ordinary users to /dashboard (admin not revealed).
    await page.waitForURL(/\/dashboard/);
    await expect(
      page.getByRole("heading", { name: /metriche globali|global metrics/i }),
    ).toHaveCount(0);
  });
});
