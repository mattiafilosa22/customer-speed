import { expect, test } from "@playwright/test";

/**
 * E2E: login flow against the seeded Fabio tenant (docs/08). Critical path per
 * CLAUDE.md. Credentials come from env (the seed passwords) so no secret is
 * committed. The tenant is resolved from `DEFAULT_ORG_SLUG=fabio`, so the form
 * needs only email + password.
 */

import type { Page } from "@playwright/test";

const EMAIL = process.env.E2E_FABIO_EMAIL ?? "fabio@fabio.local";
const PASSWORD = process.env.E2E_FABIO_PASSWORD ?? process.env.SEED_FABIO_PASSWORD ?? "";

/**
 * Dismiss the Garante cookie banner (a real visitor must choose before
 * interacting). Reject all → proceeds without tracking and stops re-prompting.
 */
async function dismissCookieBanner(page: Page): Promise<void> {
  const reject = page.getByRole("button", { name: /rifiuta tutto|reject all/i });
  if (await reject.isVisible().catch(() => false)) {
    await reject.click();
    await reject.waitFor({ state: "hidden" });
  }
}

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
    test.skip(PASSWORD.length === 0, "Set E2E_FABIO_PASSWORD / SEED_FABIO_PASSWORD to run.");

    await page.goto("/login");
    await dismissCookieBanner(page);
    await page.getByLabel(/email/i).fill(EMAIL);
    await page.getByLabel(/password/i).fill(PASSWORD);
    await page.getByRole("button", { name: /accedi|sign in/i }).click();

    await page.waitForURL(/\/dashboard/);
    await expect(page).toHaveURL(/\/dashboard/);
    // The header user menu shows the logout control once authenticated.
    await expect(page.getByRole("button", { name: /esci|sign out/i })).toBeVisible();
  });
});

test.describe("guards", () => {
  test("redirects an unauthenticated user from a protected route to login", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForURL(/\/login/);
    await expect(page).toHaveURL(/\/login/);
  });

  test("redirects a non-superAdmin away from the admin area", async ({ page }) => {
    test.skip(PASSWORD.length === 0, "Set E2E_FABIO_PASSWORD / SEED_FABIO_PASSWORD to run.");

    // Log in as Fabio (proUser), then try to reach /admin.
    await page.goto("/login");
    await dismissCookieBanner(page);
    await page.getByLabel(/email/i).fill(EMAIL);
    await page.getByLabel(/password/i).fill(PASSWORD);
    await page.getByRole("button", { name: /accedi|sign in/i }).click();
    await page.waitForURL(/\/dashboard/);

    await page.goto("/admin");
    // proUser is bounced back to their own area (least-revealing default).
    await page.waitForURL(/\/dashboard/);
    await expect(page).toHaveURL(/\/dashboard/);
  });
});
