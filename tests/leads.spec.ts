import { expect, test, type BrowserContext, type Page } from "@playwright/test";

/**
 * E2E for the two CRITICAL Phase-2 flows (docs/08 roadmap, docs/00 §5):
 *   1. creating a lead, and
 *   2. moving a lead's stage (incl. the LOST-requires-reason rule, which is the
 *      accessible keyboard alternative to kanban drag&drop — docs/02 §2.3).
 *
 * Runs against the seeded Fabio tenant (proUser). Credentials come from env (the
 * seed password) so nothing secret is committed; the suite skips when unset.
 *
 * We log in ONCE (the dev login is rate-limited per IP — docs/06 §6.1 — so one
 * UI login per spec) and reuse the authenticated storage state across tests.
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

test.describe("leads — create + stage move", () => {
  test.skip(PASSWORD.length === 0, "Set E2E_FABIO_PASSWORD / SEED_FABIO_PASSWORD to run.");
  test.describe.configure({ mode: "serial" });

  // Single UI login → one shared authenticated context+page reused across the
  // serial tests (the dev login is IP rate-limited, so we log in exactly once).
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

  test("creates a new lead and shows it in the list", async () => {
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

  test("moves a lead's stage from the detail page", async () => {
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

  test("requires a loss reason when moving to LOST (accessible alternative to drag&drop)", async () => {
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
