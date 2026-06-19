import { expect, test } from "@playwright/test";

/**
 * E2E: public self-registration is DISABLED in Fase 1 (security review decision).
 *
 * Tenants are provisioned by the superAdmin / reseller and users are created via
 * internal onboarding / invitation — there is no anonymous public signup that
 * could create a `baseUser` inside a real customer tenant. The public `/register`
 * page therefore returns 404, and the login page exposes NO "register" link.
 *
 * The `register` use case + `registerAction` remain intact and unit-tested for
 * the upcoming invitation flow; this e2e only guards the public surface.
 */

test.describe("register (public surface disabled)", () => {
  test("the public /register page returns 404 (no signup form)", async ({ page }) => {
    const response = await page.goto("/register");
    expect(response?.status()).toBe(404);

    // The Next.js not-found page renders; no registration form is present.
    await expect(page.getByLabel(/password/i)).toHaveCount(0);
    await expect(page.getByRole("button", { name: /registrati|sign up/i })).toHaveCount(0);
  });

  test("the login page does NOT offer a public registration link", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("link", { name: /registrati|sign up/i })).toHaveCount(0);
  });
});
