import { expect, test, type Page } from "@playwright/test";

async function dismissCookieBanner(page: Page): Promise<void> {
  const reject = page.getByRole("button", { name: /rifiuta tutto|reject all/i });
  if (await reject.isVisible().catch(() => false)) {
    await reject.click();
    await reject.waitFor({ state: "hidden" });
  }
}

/**
 * E2E: registration flow (critical path). Verifies:
 *  - the mandatory consents block submission when unchecked (client + server),
 *  - a valid submission (unique email + both consents) shows the
 *    "check your email" success state.
 *
 * reCAPTCHA degrades to "skipped" server-side when no key is set, so the flow
 * works in the test environment without Google keys.
 */

test.describe("register", () => {
  test("requires the privacy + terms consents before completing", async ({ page }) => {
    await page.goto("/register");
    await dismissCookieBanner(page);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    await page.getByLabel(/nome|name/i).fill("Mario Rossi");
    await page.getByLabel(/email/i).fill(`mario.${Date.now()}@example.com`);
    await page.getByLabel(/password/i).fill("Password123");

    // Submit WITHOUT ticking the consents.
    await page.getByRole("button", { name: /registrati|sign up/i }).click();

    // Field-level consent errors surface; no success state.
    await expect(
      page.getByText(/devi accettare l'informativa|must accept the privacy/i),
    ).toBeVisible();
    await expect(page.getByRole("status")).toHaveCount(0);
  });

  test("registers a new user and shows the email-confirmation message", async ({ page }) => {
    await page.goto("/register");
    await dismissCookieBanner(page);

    await page.getByLabel(/nome|name/i).fill("Mario Rossi");
    await page.getByLabel(/email/i).fill(`mario.${Date.now()}@example.com`);
    await page.getByLabel(/password/i).fill("Password123");

    // Tick both consents (checkboxes are labelled, including a link inside).
    const checkboxes = page.getByRole("checkbox");
    await checkboxes.nth(0).check();
    await checkboxes.nth(1).check();

    await page.getByRole("button", { name: /registrati|sign up/i }).click();

    // Success state (role=status) with the "check your email" copy.
    await expect(page.getByRole("status")).toBeVisible();
  });
});
