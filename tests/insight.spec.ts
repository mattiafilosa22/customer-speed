import { expect, test } from "@playwright/test";

import { FABIO_PASSWORD, KPI_PASSWORD, STORAGE_STATE } from "./support/auth";

/**
 * E2E for Insight & Stats (docs/superpowers/specs/2026-09-10-insight-stats-design.md,
 * docs/superpowers/plans/2026-09-10-insight-stats.md Task 19).
 *
 * Fabio has `insightStats:true` and `insightSourceId` linked to the "Instagram"
 * lead source (prisma/seed.ts) — the tenant the section literally replaces a
 * spreadsheet for. The read-only KPI tenant does NOT have the flag on, so it
 * doubles as the "section absent" fixture without touching Fabio's dataset.
 *
 * The critical behaviour under test — and the one thing a spreadsheet cannot
 * do — is that a sale is attributed to the day the lead is marked WON, not the
 * day its appointment was booked.
 */

test.describe("insight — cell-to-sale flow (Fabio, insightStats on)", () => {
  test.skip(FABIO_PASSWORD.length === 0, "Set E2E_FABIO_PASSWORD / SEED_FABIO_PASSWORD to run.");
  test.use({ storageState: STORAGE_STATE.fabio });
  test.describe.configure({ mode: "serial" });

  const today = new Date().toISOString().slice(0, 10);
  const unique = Date.now();
  const firstName = `Insight${unique}`;
  const lastName = "Tester";

  test("a lead created from a Welcome/Appointments cell shows up in today's count", async ({
    page,
  }) => {
    await page.goto("/insight");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    // Today's Welcome/Appointments cell starts at "–" (zero, interactive).
    const cell = page.getByRole("button", {
      name: new RegExp(`Appuntamenti Welcome, 0, ${today}|Appointments Welcome, 0, ${today}`),
    });
    await expect(cell).toBeVisible();
    await cell.click();

    // The drill-down popover opens empty; "add" opens the creation dialog.
    await page.getByRole("button", { name: /aggiungi un lead|add a lead/i }).click();

    const dialog = page.getByRole("dialog");
    await dialog.getByLabel(/^nome$|^first name$/i).fill(firstName);
    await dialog.getByLabel(/^cognome$|^last name$/i).fill(lastName);
    await dialog.getByRole("button", { name: /^salva$|^save$/i }).click();
    await expect(page.getByRole("dialog")).toBeHidden();

    // The cell now shows 1 appointment for today.
    await expect(
      page.getByRole("button", {
        name: new RegExp(`Appuntamenti Welcome, 1, ${today}|Appointments Welcome, 1, ${today}`),
      }),
    ).toBeVisible();
  });

  test("closing the lead as WON attributes the sale to today, not the appointment day", async ({
    page,
  }) => {
    // Find the lead created above via search and open it.
    await page.goto("/leads");
    await page
      .getByLabel(/cerca|search/i)
      .first()
      .fill(firstName);
    await page
      .getByRole("link", { name: new RegExp(`${firstName} ${lastName}`, "i") })
      .first()
      .click();
    await page.waitForURL(/\/leads\/[^/]+$/);

    await page.getByRole("button", { name: /aggiorna stage|update stage/i }).click();
    const stageDialog = page.getByRole("dialog");
    await stageDialog.getByLabel(/nuovo stage|new stage/i).selectOption("WON");
    await stageDialog.getByRole("button", { name: /^salva$|^save$/i }).click();
    await expect(page.getByRole("dialog")).toBeHidden();

    // Today's Welcome/Sales cell shows 1 — the closing day, not the (also
    // today, in this test, but conceptually distinct) appointment day.
    await page.goto("/insight");
    await expect(
      page.getByRole("button", {
        name: new RegExp(`Vendite Welcome, 1, ${today}|Sales Welcome, 1, ${today}`),
      }),
    ).toBeVisible();
  });

  test("manual counters save on blur and survive a reload", async ({ page }) => {
    await page.goto("/insight");
    // Desktop table and mobile cards both render (toggled via CSS breakpoint,
    // not conditional mounting), so the same field has two same-labelled
    // inputs in the DOM; `.first()` picks the one visible at desktop width,
    // matching the `.first()` convention used elsewhere in this suite.
    const label = new RegExp(`Welcome Inviati, ${today}|Welcome Sent, ${today}`);
    const input = page.getByLabel(label).first();
    await expect(input).toBeVisible();

    await input.fill("30");
    await input.blur();
    // Saving fires a Server Action on blur; wait for it to settle before
    // reloading, otherwise the reload can race the write. `aria-invalid` (not
    // a generic role=alert search, which would also match Next.js's built-in,
    // always-present route announcer) is the save failing — it's cleared on
    // success and set with a linked role="alert" message on a validation error.
    await page.waitForLoadState("networkidle");
    await expect(input).not.toHaveAttribute("aria-invalid", "true");

    await page.reload();
    await expect(page.getByLabel(label).first()).toHaveValue("30");
  });
});

test.describe("insight — hidden for a tenant with the flag off", () => {
  test.skip(KPI_PASSWORD.length === 0, "Set E2E_FABIO_PASSWORD / SEED_FABIO_PASSWORD to run.");
  test.use({ storageState: STORAGE_STATE.kpi });

  test("the nav does not show the Insight link", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("link", { name: /instagram stats|insight & stats/i })).toHaveCount(
      0,
    );
  });

  test("the /insight route is not found (flag off → 404, non-revealing)", async ({ page }) => {
    const response = await page.goto("/insight");
    expect(response?.status()).toBe(404);
  });
});
