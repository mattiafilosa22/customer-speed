import { expect, test } from "@playwright/test";

import { FABIO_PASSWORD, STORAGE_STATE } from "./support/auth";

/**
 * E2E for the Phase-5 critical flows (docs/08 roadmap, docs/00 §5):
 *   1. creating an appointment and changing its status (Da fare → Fatto),
 *   2. the sidebar mini-calendar highlighting a day with appointments.
 *
 * Runs against the seeded Fabio tenant (proUser, `appointments:true`). Seed
 * (prisma/seed.ts) gives Fabio two example appointments (one PENDING, one DONE)
 * linked to existing leads. The authenticated session comes from the `setup`
 * project (storageState) — no per-spec login (Fase 8 e2e hardening). Appointment
 * mutations don't touch the lead/invoice KPI baseline, so they don't pollute the
 * dashboard spec (which runs against a separate read-only tenant).
 */

test.skip(FABIO_PASSWORD.length === 0, "Set E2E_FABIO_PASSWORD / SEED_FABIO_PASSWORD to run.");
test.use({ storageState: STORAGE_STATE.fabio });

test.describe("appointments — create + status + mini-calendar", () => {
  test.describe.configure({ mode: "serial" });

  test("the appointments nav item is present (feature flag on for Fabio)", async ({ page }) => {
    await page.goto("/appointments");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      /appuntamenti|appointments/i,
    );
  });

  test("creates a new appointment and shows it in the list", async ({ page }) => {
    await page.goto("/appointments");

    const unique = `E2E-${Date.now()}`;
    // Tomorrow at 10:30 local, as separate date/time input values.
    const dt = new Date();
    dt.setDate(dt.getDate() + 1);
    dt.setHours(10, 30, 0, 0);
    const pad = (n: number) => String(n).padStart(2, "0");
    const dateValue = `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
    const timeValue = `${pad(dt.getHours())}:${pad(dt.getMinutes())}`;

    await page
      .getByRole("button", { name: /nuovo appuntamento|new appointment/i })
      .first()
      .click();

    const dialog = page.getByRole("dialog");
    // The start is edited as two separate native inputs (date + time), not a
    // single `datetime-local` field, so the auto-focus jump can move focus to
    // the time field once the date is fully entered (docs/02 §2.6).
    await dialog.getByLabel(/^data$|^date$/i).fill(dateValue);
    await dialog.getByLabel(/^ora$|^time$/i).fill(timeValue);
    await dialog.getByLabel(/motivo|reason/i).fill(unique);
    await dialog.getByRole("button", { name: /salva appuntamento|save appointment/i }).click();

    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(page.getByText(unique).first()).toBeVisible();
  });

  test("changes a pending appointment to done (Da fare → Fatto)", async ({ page }) => {
    // Filter to "Da fare" so we act on a pending row.
    await page.goto("/appointments?filter=todo");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    const markDone = page.getByRole("button", { name: /✓\s*fatto|✓\s*done/i }).first();
    await expect(markDone).toBeVisible();
    await markDone.click();

    // After marking done, switch to the "Fatti" tab and expect at least one row.
    await page.goto("/appointments?filter=done");
    await expect(page.getByText(/^(fatto|done)$/i).first()).toBeVisible();
  });

  test("the mini-calendar highlights a day with appointments", async ({ page }) => {
    await page.goto("/appointments");

    const calendar = page.getByRole("grid").first();
    await expect(calendar).toBeVisible();

    // A day cell whose accessible name says it has appointments (seed/created).
    const markedDay = calendar.getByRole("button", {
      name: /(ci sono appuntamenti|has appointments)/i,
    });
    await expect(markedDay.first()).toBeVisible();

    // Activating it filters the list to that day (the day chip appears).
    await markedDay.first().click();
    await expect(page.getByText(/giorno:|day:/i).first()).toBeVisible();
  });
});
