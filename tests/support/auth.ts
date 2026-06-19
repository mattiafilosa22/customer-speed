import type { Page } from "@playwright/test";

/**
 * Shared e2e auth helpers (Fase 8 e2e hardening).
 *
 * Centralizes the login flow + the Garante cookie-banner dismissal so every spec
 * (and the storageState setup) drives the SAME, real login UI. Credentials come
 * from env (the seed passwords) so nothing secret is committed; specs skip when
 * the password is unset.
 */

export const FABIO_EMAIL = process.env.E2E_FABIO_EMAIL ?? "fabio@fabio.local";
export const FABIO_PASSWORD =
  process.env.E2E_FABIO_PASSWORD ?? process.env.SEED_FABIO_PASSWORD ?? "";

export const SUPERADMIN_EMAIL =
  process.env.E2E_SUPERADMIN_EMAIL ?? "admin@customerspeed.local";
export const SUPERADMIN_PASSWORD =
  process.env.E2E_SUPERADMIN_PASSWORD ?? process.env.SEED_SUPERADMIN_PASSWORD ?? "";

/**
 * Read-only KPI tenant (prisma/seed.ts). Same baseline dataset as Fabio but
 * mutated by NO spec, so the dashboard KPI assertions stay deterministic under
 * the shared DB regardless of execution order. Reuses the Fabio seed password.
 */
export const KPI_EMAIL = process.env.E2E_KPI_EMAIL ?? "kpi@kpidemo.local";
export const KPI_PASSWORD = process.env.E2E_KPI_PASSWORD ?? FABIO_PASSWORD;

/** Paths where the per-role authenticated storage state is persisted. */
export const STORAGE_STATE = {
  fabio: "tests/.auth/fabio.json",
  superAdmin: "tests/.auth/superadmin.json",
  kpi: "tests/.auth/kpi.json",
} as const;

/**
 * Dismiss the Garante cookie banner (a real visitor must choose before
 * interacting). "Reject all" proceeds without tracking and stops re-prompting.
 */
export async function dismissCookieBanner(page: Page): Promise<void> {
  const reject = page.getByRole("button", { name: /rifiuta tutto|reject all/i });
  if (await reject.isVisible().catch(() => false)) {
    await reject.click();
    await reject.waitFor({ state: "hidden" });
  }
}

/**
 * Drive the real login UI. Login always posts a redirect to `/dashboard`; the
 * `(app)` layout then routes a superAdmin onward to `/admin` (their cross-tenant
 * context — a superAdmin has no tenant context for the tenant-scoped app pages).
 *
 * `org` selects a CUSTOMER tenant via the explicit slug seam (`/login?org=<slug>`);
 * omit it for the platform tenant (superAdmin default login). `landing` is the
 * URL pattern to await after submit (defaults to `/dashboard`; pass `/admin` for
 * the superAdmin).
 */
export async function login(
  page: Page,
  email: string,
  password: string,
  org?: string,
  landing: RegExp = /\/dashboard/,
): Promise<void> {
  await page.goto(org ? `/login?org=${org}` : "/login");
  await dismissCookieBanner(page);
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /accedi|sign in/i }).click();
  await page.waitForURL(landing);
}
