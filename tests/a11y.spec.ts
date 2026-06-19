import { expect, test } from "@playwright/test";

import {
  FABIO_PASSWORD,
  STORAGE_STATE,
  SUPERADMIN_PASSWORD,
  dismissCookieBanner,
} from "./support/auth";
import { blockingViolations, formatViolations, runAxe } from "./support/axe";

/**
 * Accessibility smoke audit (Fase 8 — docs/00 §5, docs/05 §5.6 WCAG 2.1 AA).
 *
 * Injects axe-core and asserts ZERO critical/serious WCAG 2.1 A/AA violations on
 * the main authenticated pages + the public login. Minor/moderate findings are
 * surfaced in the test output (console) for triage but do not fail the gate.
 *
 * These pages are read-only here (axe only inspects the DOM), so the audit does
 * not pollute the functional specs.
 */

async function auditPage(
  page: import("@playwright/test").Page,
  url: string,
  label: string,
): Promise<void> {
  await page.goto(url);
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  const violations = await runAxe(page);
  const blocking = blockingViolations(violations);
  if (violations.length > 0) {
    // Surface ALL findings (incl. minor/moderate) for triage.
    // eslint-disable-next-line no-console
    console.log(`[a11y] ${label} (${url}) — ${violations.length} finding(s):\n${formatViolations(violations)}`);
  }
  expect(blocking, `Critical/serious a11y violations on ${label}:\n${formatViolations(blocking)}`).toEqual([]);
}

test.describe("a11y — public login", () => {
  test("login page has no critical/serious WCAG violations", async ({ page }) => {
    await page.goto("/login");
    await dismissCookieBanner(page);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const violations = await runAxe(page);
    const blocking = blockingViolations(violations);
    if (violations.length > 0) {
      // eslint-disable-next-line no-console
      console.log(`[a11y] login (/login) — ${violations.length} finding(s):\n${formatViolations(violations)}`);
    }
    expect(blocking, `Critical/serious a11y violations on login:\n${formatViolations(blocking)}`).toEqual([]);
  });
});

test.describe("a11y — authenticated app pages (Fabio)", () => {
  test.skip(FABIO_PASSWORD.length === 0, "Set E2E_FABIO_PASSWORD / SEED_FABIO_PASSWORD to run.");
  test.use({ storageState: STORAGE_STATE.fabio });

  test("dashboard", async ({ page }) => {
    await auditPage(page, "/dashboard", "dashboard");
  });

  test("lead list", async ({ page }) => {
    await auditPage(page, "/leads", "lead list");
  });

  test("lead detail", async ({ page }) => {
    await page.goto("/leads");
    await page
      .getByRole("link", { name: /apri il lead|open lead/i })
      .first()
      .click();
    await page.waitForURL(/\/leads\/[^/]+$/);
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    const blocking = blockingViolations(await runAxe(page));
    expect(blocking, `Critical/serious a11y violations on lead detail:\n${formatViolations(blocking)}`).toEqual([]);
  });

  test("pipeline / kanban", async ({ page }) => {
    await auditPage(page, "/pipeline", "pipeline");
  });

  test("appointments", async ({ page }) => {
    await auditPage(page, "/appointments", "appointments");
  });

  test("settings / appearance", async ({ page }) => {
    await auditPage(page, "/settings/appearance", "settings appearance");
  });
});

test.describe("a11y — admin area (superAdmin)", () => {
  test.skip(
    SUPERADMIN_PASSWORD.length === 0,
    "Set E2E_SUPERADMIN_PASSWORD / SEED_SUPERADMIN_PASSWORD to run.",
  );
  test.use({ storageState: STORAGE_STATE.superAdmin });

  test("admin metrics", async ({ page }) => {
    await auditPage(page, "/admin", "admin metrics");
  });

  test("admin tenants", async ({ page }) => {
    await auditPage(page, "/admin/tenants", "admin tenants");
  });
});
