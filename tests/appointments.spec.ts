import { expect, test, type BrowserContext, type Page } from "@playwright/test";

/**
 * E2E for the Phase-5 critical flows (docs/08 roadmap, docs/00 §5):
 *   1. creating an appointment and changing its status (Da fare → Fatto),
 *   2. the sidebar mini-calendar highlighting a day with appointments.
 *
 * Runs against the seeded Fabio tenant (proUser, `appointments:true`). Seed
 * (prisma/seed.ts) gives Fabio two example appointments (one PENDING, one DONE)
 * linked to existing leads. Credentials come from env (the seed password) so
 * nothing secret is committed; the suite skips when unset.
 *
 * We log in ONCE (the dev login is rate-limited per IP) and reuse the
 * authenticated context across the serial tests.
 */

const EMAIL = process.env.E2E_FABIO_EMAIL ?? "fabio@fabio.local";
const PASSWORD = process.env.E2E_FABIO_PASSWORD ?? process.env.SEED_FABIO_PASSWORD ?? "";

async function dismissCookieBanner(page: Page): Promise<void> {
  const reject = page.getByRole("button", { name: /rifiuta tutto|reject all/i });
  if (await reject.isVisible().catch(() => false)) {
    await reject.click();
    await reject.waitFor({ state: "hidden" });
  }
}

test.describe("appointments — create + status + mini-calendar", () => {
  test.skip(PASSWORD.length === 0, "Set E2E_FABIO_PASSWORD / SEED_FABIO_PASSWORD to run.");
  test.describe.configure({ mode: "serial" });

  let context: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext();
    page = await context.newPage();
    await page.goto("/login?org=fabio");
    await dismissCookieBanner(page);
    await page.getByLabel(/email/i).fill(EMAIL);
    await page.getByLabel(/password/i).fill(PASSWORD);
    await page.getByRole("button", { name: /accedi|sign in/i }).click();
    await page.waitForURL(/\/dashboard/);
  });

  test.afterAll(async () => {
    await context.close();
  });

  test("the appointments nav item is present (feature flag on for Fabio)", async () => {
    await page.goto("/appointments");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/appuntamenti|appointments/i);
  });

  test("creates a new appointment and shows it in the list", async () => {
    await page.goto("/appointments");

    const unique = `E2E-${Date.now()}`;
    // Tomorrow at 10:30 local, as a datetime-local value.
    const dt = new Date();
    dt.setDate(dt.getDate() + 1);
    dt.setHours(10, 30, 0, 0);
    const pad = (n: number) => String(n).padStart(2, "0");
    const localValue = `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(
      dt.getHours(),
    )}:${pad(dt.getMinutes())}`;

    await page
      .getByRole("button", { name: /nuovo appuntamento|new appointment/i })
      .first()
      .click();

    const dialog = page.getByRole("dialog");
    await dialog.getByLabel(/data e ora|date and time/i).fill(localValue);
    await dialog.getByLabel(/motivo|reason/i).fill(unique);
    await dialog.getByRole("button", { name: /salva appuntamento|save appointment/i }).click();

    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(page.getByText(unique).first()).toBeVisible();
  });

  test("changes a pending appointment to done (Da fare → Fatto)", async () => {
    // Filter to "Da fare" so we act on a pending row.
    await page.goto("/appointments?filter=todo");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    const markDone = page
      .getByRole("button", { name: /✓\s*fatto|✓\s*done/i })
      .first();
    await expect(markDone).toBeVisible();
    await markDone.click();

    // After marking done, switch to the "Fatti" tab and expect at least one row.
    await page.goto("/appointments?filter=done");
    await expect(page.getByText(/^(fatto|done)$/i).first()).toBeVisible();
  });

  test("the mini-calendar highlights a day with appointments", async () => {
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
