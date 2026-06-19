import { expect, test } from "@playwright/test";

import {
  FABIO_EMAIL,
  FABIO_PASSWORD,
  SUPERADMIN_EMAIL,
  SUPERADMIN_PASSWORD,
  dismissCookieBanner,
  login,
} from "./support/auth";

/**
 * E2E: login flow against the seeded Fabio tenant (docs/08). Critical path per
 * CLAUDE.md. Credentials come from env (the seed passwords) so no secret is
 * committed.
 *
 * This spec exercises the REAL login UI end-to-end, so it deliberately does NOT
 * consume the shared storageState (the rest of the suite reuses the `setup`
 * project's authenticated session instead — Fase 8 e2e hardening).
 *
 * Tenant resolution: the default tenant is the NEUTRAL platform tenant
 * (`DEFAULT_ORG_SLUG=customerspeed`), so a CUSTOMER tenant like Fabio is reached
 * with an explicit slug — `/login?org=fabio`. This mirrors the future subdomain
 * routing seam (host → slug) without changing the form.
 */

test.describe("login", () => {
  test("rejects invalid credentials with a generic, non-revealing message", async ({ page }) => {
    await page.goto("/login");
    await dismissCookieBanner(page);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    await page.getByLabel(/email/i).fill("nobody@example.com");
    await page.getByLabel(/password/i).fill("WrongPassword123");
    await page.getByRole("button", { name: /accedi|sign in/i }).click();

    // Generic error (no "user not found" vs "wrong password" distinction).
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test("logs in with the seeded Fabio credentials and lands on the dashboard", async ({ page }) => {
    test.skip(FABIO_PASSWORD.length === 0, "Set E2E_FABIO_PASSWORD / SEED_FABIO_PASSWORD to run.");

    // Fabio is a customer tenant → reach it with the explicit slug.
    await login(page, FABIO_EMAIL, FABIO_PASSWORD, "fabio");
    await expect(page).toHaveURL(/\/dashboard/);
    // The header user menu shows the logout control once authenticated.
    await expect(page.getByRole("button", { name: /esci|sign out/i })).toBeVisible();
  });

  /**
   * Regression (Fase 8): a superAdmin logging in must NOT crash on the
   * tenant-scoped `/dashboard`. Login always redirects to `/dashboard`, but a
   * superAdmin has NO tenant context, so the dashboard's `requireTenantContext()`
   * threw `UnauthorizedError("Tenant context required")` → a 500 error page. The
   * `(app)` layout now forwards a superAdmin to their cross-tenant `/admin` area.
   * Expected: lands on a working `/admin` page (global metrics), never a 500.
   */
  test("a superAdmin signing in is routed to the working admin area (no 500)", async ({ page }) => {
    test.skip(
      SUPERADMIN_PASSWORD.length === 0,
      "Set E2E_SUPERADMIN_PASSWORD / SEED_SUPERADMIN_PASSWORD to run.",
    );

    await login(page, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD, undefined, /\/admin/);
    await expect(page).toHaveURL(/\/admin/);
    await expect(
      page.getByRole("heading", { name: /metriche globali|global metrics/i }),
    ).toBeVisible();
    // The crashing dashboard error page must NOT be shown.
    await expect(page.getByText(/tenant context required/i)).toHaveCount(0);
  });
});

test.describe("guards", () => {
  test("redirects an unauthenticated user from a protected route to login", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForURL(/\/login/);
    await expect(page).toHaveURL(/\/login/);
  });
});
