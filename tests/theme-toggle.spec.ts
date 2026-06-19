import { expect, test } from "@playwright/test";

import { FABIO_PASSWORD, STORAGE_STATE } from "./support/auth";

/**
 * E2E for the header light/dark theme toggle (user feedback — "switchare tra
 * tema light e dark in alto a destra", and "dark mode doesn't work"). Verifies:
 *   1. the toggle flips the live `data-theme` (the dark palette actually applies,
 *      instead of being overridden by inline light surfaces — the bug it fixes);
 *   2. the choice persists across a full reload via the `cs-theme-mode` cookie
 *      (server renders the same mode → no flash).
 */

test.skip(FABIO_PASSWORD.length === 0, "Set E2E_FABIO_PASSWORD / SEED_FABIO_PASSWORD to run.");
test.use({ storageState: STORAGE_STATE.fabio });

const themedMode = (page: import("@playwright/test").Page) =>
  page.locator("[data-theme]").first().getAttribute("data-theme");

test.describe("theme toggle — light/dark", () => {
  test("flips the live theme and persists across reload", async ({ page }) => {
    await page.goto("/dashboard");
    expect(await themedMode(page)).toBe("light");

    // Toggle to dark.
    await page.getByRole("button", { name: /tema scuro|dark theme/i }).click();
    expect(await themedMode(page)).toBe("dark");

    // Reload: the cookie makes the server render dark on first paint.
    await page.reload();
    expect(await themedMode(page)).toBe("dark");

    // Toggle back to light and confirm it persists too.
    await page.getByRole("button", { name: /tema chiaro|light theme/i }).click();
    expect(await themedMode(page)).toBe("light");
    await page.reload();
    expect(await themedMode(page)).toBe("light");
  });
});
