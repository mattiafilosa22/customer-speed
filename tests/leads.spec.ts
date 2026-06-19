import { expect, test } from "@playwright/test";

import { FABIO_PASSWORD, STORAGE_STATE } from "./support/auth";

/**
 * E2E for the two CRITICAL Phase-2 flows (docs/08 roadmap, docs/00 §5):
 *   1. creating a lead, and
 *   2. moving a lead's stage (incl. the LOST-requires-reason rule, which is the
 *      accessible keyboard alternative to kanban drag&drop — docs/02 §2.3).
 *
 * Runs against the seeded Fabio tenant (proUser). The authenticated session is
 * provided by the `setup` project (storageState) — no per-spec UI login — so the
 * suite never re-hits the rate-limited login form (Fase 8 e2e hardening). This
 * spec MUTATES Fabio (creates a lead, moves stages); the dashboard KPI spec runs
 * against a separate read-only tenant so those mutations can't pollute it.
 */

test.skip(FABIO_PASSWORD.length === 0, "Set E2E_FABIO_PASSWORD / SEED_FABIO_PASSWORD to run.");
test.use({ storageState: STORAGE_STATE.fabio });

test.describe("leads — create + stage move", () => {
  // Serial: the stage-move tests act on "the first lead" and must not race.
  test.describe.configure({ mode: "serial" });

  test("creates a new lead and shows it in the list", async ({ page }) => {
    await page.goto("/leads");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    const unique = Date.now();
    const firstName = `E2E${unique}`;
    const lastName = "Tester";

    await page
      .getByRole("button", { name: /nuovo lead|new lead/i })
      .first()
      .click();

    const dialog = page.getByRole("dialog");
    await dialog
      .getByLabel(/nome|first name/i)
      .first()
      .fill(firstName);
    await dialog
      .getByLabel(/cognome|last name/i)
      .first()
      .fill(lastName);
    await dialog.getByRole("button", { name: /crea lead|create lead/i }).click();

    await expect(page.getByRole("dialog")).toBeHidden();
    await page
      .getByLabel(/cerca|search/i)
      .first()
      .fill(firstName);
    await expect(page.getByText(`${firstName} ${lastName}`).first()).toBeVisible();
  });

  test("moves a lead's stage from the detail page", async ({ page }) => {
    await page.goto("/leads");
    await page
      .getByRole("link", { name: /apri il lead|open lead/i })
      .first()
      .click();
    await page.waitForURL(/\/leads\/[^/]+$/);

    await page.getByRole("button", { name: /aggiorna stage|update stage/i }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel(/nuovo stage|new stage/i).selectOption("WAITING_DOCS");
    await dialog.getByRole("button", { name: /salva|save/i }).click();

    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(page.getByText(/attesa documenti|waiting for documents/i).first()).toBeVisible();
  });

  test("requires a loss reason when moving to LOST (accessible alternative to drag&drop)", async ({
    page,
  }) => {
    await page.goto("/leads");
    await page
      .getByRole("link", { name: /apri il lead|open lead/i })
      .first()
      .click();
    await page.waitForURL(/\/leads\/[^/]+$/);

    await page.getByRole("button", { name: /aggiorna stage|update stage/i }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel(/nuovo stage|new stage/i).selectOption("LOST");

    // The loss-reason select is revealed by selecting LOST.
    const reason = dialog.getByLabel(/motivo della perdita|loss reason/i);
    await expect(reason).toBeVisible();
    await reason.selectOption({ index: 1 });
    await dialog.getByRole("button", { name: /salva|save/i }).click();

    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(page.getByText(/^(persa|lost)$/i).first()).toBeVisible();
  });
});

/**
 * Capital editor (docs/02 §2.4): the consultant sets an EXACT amount instead of
 * a bracket; the bracket is derived server-side and the detail page then shows
 * the cifra (and the derived bracket 100–250k surfaces on the kanban card).
 * Creates its own lead so it never races the serial stage-move tests above.
 */
test.describe("leads — exact capital amount", () => {
  test("sets an exact € amount and shows the figure on detail + kanban", async ({ page }) => {
    const unique = Date.now();
    const firstName = `Capital${unique}`;
    const lastName = "Tester";

    // Create a dedicated lead.
    await page.goto("/leads");
    await page
      .getByRole("button", { name: /nuovo lead|new lead/i })
      .first()
      .click();
    const createDialog = page.getByRole("dialog");
    await createDialog
      .getByLabel(/nome|first name/i)
      .first()
      .fill(firstName);
    await createDialog
      .getByLabel(/cognome|last name/i)
      .first()
      .fill(lastName);
    await createDialog.getByRole("button", { name: /crea lead|create lead/i }).click();
    await expect(page.getByRole("dialog")).toBeHidden();

    // Open it via search.
    await page
      .getByLabel(/cerca|search/i)
      .first()
      .fill(firstName);
    await page
      .getByRole("link", { name: new RegExp(`${firstName} ${lastName}`, "i") })
      .first()
      .click();
    await page.waitForURL(/\/leads\/[^/]+$/);

    // Switch the capital editor to "Importo esatto". The radio is visually hidden
    // behind a styled <label> (the Segmented control), so click the label text —
    // this fires the real native change → React onValueChange (which a forced
    // check on the sr-only input would skip).
    await page.locator("label").filter({ hasText: /^(importo esatto|exact amount)$/i }).click();
    const amount = page.getByRole("textbox", { name: /importo esatto|exact amount/i });
    await amount.fill("175000");
    await page
      .locator("form")
      .filter({ has: amount })
      .getByRole("button", { name: /^(salva|save)$/i })
      .click();

    // The summary card now shows the exact figure (EUR, locale-formatted:
    // IT "175.000,00 €" / EN "€175,000.00"), not the bracket label.
    await expect(page.getByText(/175[.,]000/).first()).toBeVisible();

    // The derived bracket (100-250k) surfaces on the kanban card, which now
    // shows the exact figure too.
    await page.goto("/pipeline");
    const card = page.locator("article", { hasText: `${firstName} ${lastName}` }).first();
    await expect(card).toBeVisible();
    await expect(card.getByText(/175[.,]000/)).toBeVisible();
  });
});
