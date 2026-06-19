import { expect, test } from "@playwright/test";

test.describe("home smoke", () => {
  test("the index forwards an anonymous visitor to the login page", async ({ page }) => {
    // `/` redirects to `/dashboard`; the (app) guard then sends an unauthenticated
    // visitor to `/login`. Opening the app must land on the product, not a scaffold.
    await page.goto("/");
    await page.waitForURL(/\/login/);
    await expect(page.getByRole("button", { name: /accedi|sign in/i })).toBeVisible();
  });
});
