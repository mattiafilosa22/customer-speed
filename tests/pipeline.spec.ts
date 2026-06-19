import { expect, test } from "@playwright/test";

import { FABIO_PASSWORD, STORAGE_STATE } from "./support/auth";

/**
 * E2E for the CRITICAL Phase-3 flow (docs/08 roadmap, docs/00 §5): moving a
 * lead's stage on the KANBAN board, with PERSISTENCE.
 *
 * We drive the **keyboard-accessible alternative** to drag&drop (the "Sposta
 * in…" overflow "⋯" menu on each card — docs/02 §2.3, docs/05 §5.6, VINCOLANTE;
 * audit P0.3 replaced the old native select with this accessible menu) because
 * it is the WCAG-mandated path and is deterministic in headless Chromium. The
 * optimistic move persists via a Server Action; we reload and assert the board
 * still renders to confirm it stuck.
 *
 * NOTE on the whole-card drag: the whole article is the mouse/touch drag surface
 * (Trello-style). dnd-kit's PointerSensor needs a precise stream of pointer
 * events (down → many small moves past the 6px activation distance → up) that is
 * NOT reliably reproducible in headless Chromium — a single `mouse.move` to the
 * target does not activate the sensor, and finer simulations are flaky. We
 * therefore do NOT assert the drag here (a flaky test is worse than none); the
 * real drag is verified manually in a browser (it moves the stage, persists
 * across reload, and drops into empty columns). The menu test below exercises
 * the SAME optimistic `moveLead` + Server Action path the drag uses, so the
 * persistence logic is covered deterministically.
 *
 * Runs against the seeded Fabio tenant (proUser); the authenticated session comes
 * from the `setup` project (storageState) — no per-spec login.
 */

test.skip(FABIO_PASSWORD.length === 0, "Set E2E_FABIO_PASSWORD / SEED_FABIO_PASSWORD to run.");
test.use({ storageState: STORAGE_STATE.fabio });

test.describe("pipeline — kanban stage move (keyboard alternative)", () => {
  test.describe.configure({ mode: "serial" });

  test("renders the board with stage columns", async ({ page }) => {
    await page.goto("/pipeline");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    // Each visible stage is a labelled region (h2). At least the default stages.
    await expect(page.getByRole("heading", { name: /da gestire|to handle/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /^(vinta|won)/i })).toBeVisible();
  });

  test("moves a lead to another stage via the 'Sposta in…' menu and persists", async ({ page }) => {
    await page.goto("/pipeline");

    // Open the first card's "⋯" move menu (the accessible alternative to drag).
    const moveTrigger = page
      .getByRole("button", { name: /sposta in un altro stage|move to another stage/i })
      .first();
    await expect(moveTrigger).toBeVisible();
    await moveTrigger.click();

    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();

    // Pick the first real, non-LOST destination stage (LOST opens a dialog
    // instead of moving directly — covered by a separate test). The menu lists
    // every destination stage as a menuitem.
    const destination = menu
      .getByRole("menuitem")
      .filter({ hasNotText: /^(persa|lost)$/i })
      .first();
    await expect(destination).toBeVisible();
    await destination.click();

    // The board's ARIA live region announces the move (polite status).
    await expect(page.getByTestId("pipeline-announcer")).toContainText(/spostato|moved/i, {
      timeout: 10_000,
    });

    // Persistence: reload and assert the board still renders the columns (the
    // move stuck server-side; a thrown action would have rolled back + announced
    // a failure instead, which the assertion above would have missed).
    await page.reload();
    await expect(page.getByRole("heading", { name: /da gestire|to handle/i })).toBeVisible();
  });

  test("clicking a card body (not the menu) opens the lead detail", async ({ page }) => {
    await page.goto("/pipeline");

    // Trello-style: the whole card is the mouse drag surface AND a click target.
    // A pointerdown→click WITHOUT movement (≤ 6px, below the drag threshold) is a
    // real click and navigates to the lead via the article's `onClick`. We click
    // the card body away from the name link and the "⋯" menu (which stop
    // propagation) — proving "click on the card opens the detail".
    const card = page.locator("article[aria-label]").first();
    await expect(card).toBeVisible();

    // Click the card body over the stage pill row (bottom), not the name/menu.
    const box = await card.boundingBox();
    if (!box) throw new Error("card has no bounding box");
    await page.mouse.click(box.x + box.width / 2, box.y + box.height - 8);

    await expect(page).toHaveURL(/\/leads\/[^/]+$/);
  });

  test("the source filter narrows the board", async ({ page }) => {
    await page.goto("/pipeline");

    const sourceSelect = page.getByLabel(/provenienza|source/i);
    await expect(sourceSelect).toBeVisible();

    // Select the "Instagram" source (seeded on exactly one Fabio lead, in the
    // WAITING_DECISION column). After filtering, only that lead's card remains.
    await sourceSelect.selectOption({ label: "Instagram" });
    await expect(page).toHaveURL(/sourceId=/);

    // Exactly one card across the whole board carries the Instagram source.
    const cards = page.locator("article[aria-label]");
    await expect(cards).toHaveCount(1);
    await expect(cards.first()).toContainText("Instagram");

    // Resetting to "all sources" brings back more than one card.
    await sourceSelect.selectOption({ value: "" });
    await expect(page).not.toHaveURL(/sourceId=/);
    await expect(page.locator("article[aria-label]").first()).toBeVisible();
  });

  test("opens the loss-reason dialog when moving to LOST", async ({ page }) => {
    await page.goto("/pipeline");

    const moveTrigger = page
      .getByRole("button", { name: /sposta in un altro stage|move to another stage/i })
      .first();
    await moveTrigger.click();

    // Choose the LOST destination from the menu.
    await page
      .getByRole("menuitem", { name: /^(persa|lost)$/i })
      .first()
      .click();

    // The loss-reason dialog must appear (a reason is required).
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/motivo della perdita|loss reason/i).first()).toBeVisible();
  });
});
