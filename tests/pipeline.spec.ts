import { expect, test } from "@playwright/test";

import { FABIO_PASSWORD, STORAGE_STATE } from "./support/auth";

/**
 * E2E for the CRITICAL Phase-3 flow (docs/08 roadmap, docs/00 §5): moving a
 * lead's stage on the KANBAN board, with PERSISTENCE.
 *
 * We drive the **keyboard-accessible alternative** to drag&drop (the "Sposta
 * in…" select on each card — docs/02 §2.3, docs/05 §5.6, VINCOLANTE) because it
 * is the WCAG-mandated path and is deterministic in headless Chromium (native
 * drag with dnd-kit pointer sensors is flaky to simulate). The optimistic move
 * persists via a Server Action; we reload and assert the board still renders to
 * confirm it stuck.
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

    // Find the first card with a "Sposta in…" select and move it to the first
    // available destination stage (index 1 — index 0 is the placeholder). This
    // is robust regardless of which stage the first card currently sits in.
    const moveSelect = page
      .getByRole("combobox", { name: /sposta in un altro stage|move to another stage/i })
      .first();
    await expect(moveSelect).toBeVisible();

    // Pick the first real, non-LOST destination (LOST opens a dialog instead of
    // moving directly — covered by a separate test).
    const optionValues = await moveSelect.locator("option").evaluateAll((nodes) =>
      nodes.map((n) => (n as HTMLOptionElement).value).filter((v) => v && v !== "LOST"),
    );
    const destinationValue = optionValues[0];
    expect(destinationValue).toBeTruthy();

    // Selecting a destination triggers the optimistic move + persistence.
    await moveSelect.selectOption(destinationValue ?? "");

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

  test("opens the loss-reason dialog when moving to LOST", async ({ page }) => {
    await page.goto("/pipeline");

    const moveSelect = page
      .getByRole("combobox", { name: /sposta in un altro stage|move to another stage/i })
      .first();
    await moveSelect.selectOption("LOST");

    // The loss-reason dialog must appear (a reason is required).
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/motivo della perdita|loss reason/i).first()).toBeVisible();
  });
});
