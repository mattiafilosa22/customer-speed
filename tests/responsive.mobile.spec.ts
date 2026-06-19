import { expect, test } from "@playwright/test";

import { FABIO_PASSWORD, STORAGE_STATE } from "./support/auth";

/**
 * E2E responsive audit on a MOBILE viewport (Fase 8 hardening, docs/05 §5.7).
 *
 * Runs in the `mobile` Playwright project (Pixel 7, 412×915) and reuses Fabio's
 * storageState. Verifies the mobile-first adaptations required by docs/05 §5.7:
 *   - the fixed desktop sidebar is hidden and navigation collapses to a drawer
 *     (hamburger → Radix Dialog: focus-trapped, ESC/overlay to close),
 *   - the lead TABLE collapses to a tappable CARD list,
 *   - the pipeline KANBAN is a horizontally-scrollable column strip.
 *
 * These are read-only assertions (no mutation), so they don't pollute other
 * specs.
 */

test.skip(FABIO_PASSWORD.length === 0, "Set E2E_FABIO_PASSWORD / SEED_FABIO_PASSWORD to run.");
test.use({ storageState: STORAGE_STATE.fabio });

test.describe("responsive (mobile) — drawer, cards, kanban scroll", () => {
  test("the desktop sidebar is hidden and the hamburger opens the nav drawer", async ({ page }) => {
    await page.goto("/dashboard");

    // The persistent desktop sidebar (<aside>, lg:block) must NOT be visible.
    await expect(page.getByRole("complementary")).toBeHidden();

    // The hamburger trigger is present (>= 44px touch target) and opens the drawer.
    const hamburger = page.getByRole("button", {
      name: /apri il menu di navigazione|open the navigation menu/i,
    });
    await expect(hamburger).toBeVisible();
    await hamburger.click();

    // The drawer dialog opens with the main navigation inside. (Radix labels the
    // dialog from its sr-only Title — the appName — so we match the open dialog
    // generically and assert the nav links it contains.)
    const drawer = page.getByRole("dialog");
    await expect(drawer).toBeVisible();
    await expect(drawer.getByRole("link", { name: /dashboard/i }).first()).toBeVisible();

    // ESC closes it (Radix focus management) — accessible dismissal.
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
  });

  test("the lead list renders as a tappable card list (table collapsed)", async ({ page }) => {
    await page.goto("/leads");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    // On mobile the table is hidden; the card list (<ul> of "Apri il lead" links)
    // is what the user sees and taps.
    const cards = page.getByRole("link", { name: /apri il lead|open lead/i });
    await expect(cards.first()).toBeVisible();

    // The desktop table has role="table"; it must be hidden at this viewport.
    await expect(page.getByRole("table")).toBeHidden();
  });

  test("the pipeline kanban is a horizontally scrollable column strip", async ({ page }) => {
    await page.goto("/pipeline");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    const board = page.getByRole("list", {
      name: /board kanban della pipeline|pipeline kanban board/i,
    });
    await expect(board).toBeVisible();

    // The board overflows horizontally (more columns than fit the phone width):
    // scrollWidth > clientWidth confirms the scrollable strip per docs/05 §5.7.
    const overflows = await board.evaluate(
      (el) => el.scrollWidth > el.clientWidth + 1,
    );
    expect(overflows).toBe(true);
  });
});
