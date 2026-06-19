import { expect, test } from "@playwright/test";

import { FABIO_PASSWORD, STORAGE_STATE } from "./support/auth";

/**
 * E2E for the Phase-4 critical flow (docs/08 roadmap, docs/00 §5): the DASHBOARD
 * renders KPI tiles and the summary blocks coherently with the seed.
 *
 * DATA ISOLATION (Fase 8 e2e hardening): this spec asserts EXACT KPI figures
 * (4 leads, 1 won, 1 lost, 25% conversion, 5.000 € net), so it runs against the
 * dedicated READ-ONLY `kpidemo` tenant (prisma/seed.ts) — same baseline dataset
 * as Fabio's seed, but mutated by NO spec. The leads/pipeline specs mutate Fabio
 * (create a 5th lead, move stages); pointing the dashboard assertions at a tenant
 * nobody mutates makes them deterministic regardless of execution order or
 * parallelism, on a shared DB. The authenticated session comes from the `setup`
 * project (storageState) — no per-spec login.
 *
 * Seed for the kpidemo tenant (current year): 4 leads — 1 WON, 1 LOST, 2 active —
 * plus ONE invoice on the WON lead with net 5000,00 €. Default period = current
 * year, so the dashboard must show: Lead totali 4, Vinte 1, Perse 1, Conv. 25%,
 * Fatturato netto 5.000,00 €, the "Vendite perse" block and the active-leads list.
 */

test.skip(FABIO_PASSWORD.length === 0, "Set E2E_FABIO_PASSWORD / SEED_FABIO_PASSWORD to run.");
test.use({ storageState: STORAGE_STATE.kpi });

test.describe("dashboard — KPIs coherent with the seed", () => {
  test("greets the user and renders the KPI tiles", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/ciao|hi/i);

    const kpis = page.getByRole("region", { name: /indicatori principali|key indicators/i });
    await expect(kpis).toBeVisible();
    await expect(kpis.getByText(/lead totali|total leads/i)).toBeVisible();
    await expect(kpis.getByText(/^(vinte|won)$/i)).toBeVisible();
    await expect(kpis.getByText(/conv\. rate/i)).toBeVisible();
    await expect(kpis.getByText(/fatturato netto|net revenue/i)).toBeVisible();
  });

  test("shows KPI figures coherent with the seed (4 leads, 1 won, 25%)", async ({ page }) => {
    await page.goto("/dashboard");
    const kpis = page.getByRole("region", { name: /indicatori principali|key indicators/i });

    // Conversion rate = 1 won / 4 total = 25%.
    await expect(kpis.getByText("25%")).toBeVisible();
    // Net revenue tile shows the seeded EUR amount (IT grouping: "5.000").
    await expect(kpis.getByText(/5[.,]?000/)).toBeVisible();
  });

  test("renders the distribution, invoice summary, lost and active blocks", async ({ page }) => {
    await page.goto("/dashboard");

    await expect(
      page.getByRole("heading", { name: /distribuzione pipeline|pipeline distribution/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /riepilogo fatture|invoice summary/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /vendite perse|lost sales/i }),
    ).toBeVisible();
    // The active-leads block + at least one active (non-terminal) lead row.
    await expect(page.getByRole("heading", { name: /^(lead totali|total leads)$/i })).toBeVisible();
  });

  test("the period filter is present and updates the data", async ({ page }) => {
    await page.goto("/dashboard");
    // Exact label so it matches the period <select> ("Mese"/"Month") and NOT the
    // sidebar mini-calendar's "Mese precedente/successivo" buttons.
    const monthSelect = page.getByLabel(/^(mese|month)$/i);
    await expect(monthSelect).toBeVisible();

    // Pick January (month value "1"): the seeded data (issued/created "today")
    // falls out of it, so the conversion rate should drop to 0%.
    await monthSelect.selectOption("1");
    await page.waitForLoadState("networkidle");
    const kpis = page.getByRole("region", { name: /indicatori principali|key indicators/i });
    await expect(kpis.getByText("0%")).toBeVisible();
  });
});
