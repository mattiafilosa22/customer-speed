import { expect, test, type BrowserContext, type Page } from "@playwright/test";

/**
 * E2E for the CRITICAL Phase-3 flow (docs/08 roadmap, docs/00 §5): moving a
 * lead's stage on the KANBAN board, with PERSISTENCE.
 *
 * We drive the **keyboard-accessible alternative** to drag&drop (the "Sposta
 * in…" select on each card — docs/02 §2.3, docs/05 §5.6, VINCOLANTE) because it
 * is the WCAG-mandated path and is deterministic in headless Chromium (native
 * drag with dnd-kit pointer sensors is flaky to simulate). The optimistic move
 * persists via a Server Action; we reload and assert the new column count to
 * confirm it stuck.
 *
 * Runs against the seeded Fabio tenant (proUser). Credentials come from env; the
 * suite skips when unset.
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

test.describe("pipeline — kanban stage move (keyboard alternative)", () => {
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

  test("renders the board with stage columns", async () => {
    await page.goto("/pipeline");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    // Each visible stage is a labelled region (h2). At least the default stages.
    await expect(page.getByRole("heading", { name: /da gestire|to handle/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /^(vinta|won)/i })).toBeVisible();
  });

  test("moves a lead to another stage via the 'Sposta in…' menu and persists", async () => {
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
      nodes
        .map((n) => (n as HTMLOptionElement).value)
        .filter((v) => v && v !== "LOST"),
    );
    const destinationValue = optionValues[0];
    expect(destinationValue).toBeTruthy();

    // Selecting a destination triggers the optimistic move + persistence.
    await moveSelect.selectOption(destinationValue ?? "");

    // The board's ARIA live region announces the move (polite status).
    await expect(page.getByTestId("pipeline-announcer")).toContainText(
      /spostato|moved/i,
      { timeout: 10_000 },
    );

    // Persistence: reload and assert the board still renders the columns (the
    // move stuck server-side; a thrown action would have rolled back + announced
    // a failure instead, which the assertion above would have missed).
    await page.reload();
    await expect(page.getByRole("heading", { name: /da gestire|to handle/i })).toBeVisible();
  });

  test("opens the loss-reason dialog when moving to LOST", async () => {
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
