import { afterEach, describe, expect, it, vi } from "vitest";

import { UnauthorizedError, ValidationError } from "@/lib/errors";
import { THEME_PRESETS } from "@/lib/theme-presets";

/**
 * Appearance Server Action tests — the UI security boundary: auth (tenant
 * context) → RBAC (`settings.tenant`) → use case, throwing a STABLE i18n key on
 * failure. We use the REAL `requirePermission` (so the baseUser denial is
 * exercised against the actual RBAC matrix) and mock only the context + use
 * cases.
 */

const requireTenantContext = vi.fn();
const buildOrganizationDeps = vi.fn((..._a: unknown[]) => ({ kind: "org" }));
const updateOrganizationTheme = vi.fn((...args: unknown[]): unknown => args);
const updateOrganizationBranding = vi.fn((...args: unknown[]): unknown => args);

vi.mock("@/lib/tenant", () => ({
  requireTenantContext: (...a: unknown[]) => requireTenantContext(...a),
}));
vi.mock("@/server/organization", () => ({
  buildOrganizationDeps: (...a: unknown[]) => buildOrganizationDeps(...a),
  updateOrganizationTheme: (...a: unknown[]) => updateOrganizationTheme(...a),
  updateOrganizationBranding: (...a: unknown[]) => updateOrganizationBranding(...a),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  updateBrandingAction,
  updateThemeAction,
} from "@/app/[locale]/(app)/settings/appearance/actions";

const PRO = { kind: "tenant", role: "proUser", organizationId: "org_a", userId: "u" };
const BASE = { kind: "tenant", role: "baseUser", organizationId: "org_a", userId: "u" };

afterEach(() => vi.clearAllMocks());

describe("updateThemeAction", () => {
  it("checks settings.tenant and persists (happy path)", async () => {
    requireTenantContext.mockResolvedValue(PRO);
    updateOrganizationTheme.mockResolvedValue({ ok: true });

    const res = await updateThemeAction({ theme: THEME_PRESETS.teal });

    expect(buildOrganizationDeps).toHaveBeenCalledWith(PRO);
    expect(updateOrganizationTheme).toHaveBeenCalled();
    expect(res).toEqual({ ok: true });
  });

  it("DENIES baseUser (no settings.tenant) → unauthorized key, no write", async () => {
    requireTenantContext.mockResolvedValue(BASE);

    await expect(updateThemeAction({ theme: THEME_PRESETS.teal })).rejects.toThrow(
      "appearance.errors.unauthorized",
    );
    expect(updateOrganizationTheme).not.toHaveBeenCalled();
  });

  it("maps missing auth to the unauthorized key", async () => {
    requireTenantContext.mockRejectedValue(new UnauthorizedError());

    await expect(updateThemeAction({ theme: THEME_PRESETS.teal })).rejects.toThrow(
      "appearance.errors.unauthorized",
    );
  });

  it("maps a contrast ValidationError to the contrast key", async () => {
    requireTenantContext.mockResolvedValue(PRO);
    updateOrganizationTheme.mockRejectedValue(
      new ValidationError({ theme: ["contrast.white-on-accent"] }),
    );

    await expect(updateThemeAction({ theme: THEME_PRESETS.teal })).rejects.toThrow(
      "appearance.errors.contrast",
    );
  });

  it("maps a generic ValidationError to the invalid key", async () => {
    requireTenantContext.mockResolvedValue(PRO);
    updateOrganizationTheme.mockRejectedValue(new ValidationError({ theme: ["Bad shape"] }));

    await expect(updateThemeAction({ theme: THEME_PRESETS.teal })).rejects.toThrow(
      "appearance.errors.invalid",
    );
  });
});

describe("updateBrandingAction", () => {
  it("checks settings.tenant and persists (happy path)", async () => {
    requireTenantContext.mockResolvedValue(PRO);
    updateOrganizationBranding.mockResolvedValue({ ok: true });

    const res = await updateBrandingAction({ appName: "X", poweredBy: true });

    expect(updateOrganizationBranding).toHaveBeenCalled();
    expect(res).toEqual({ ok: true });
  });

  it("DENIES baseUser → unauthorized key, no write", async () => {
    requireTenantContext.mockResolvedValue(BASE);

    await expect(updateBrandingAction({ appName: "X", poweredBy: true })).rejects.toThrow(
      "appearance.errors.unauthorized",
    );
    expect(updateOrganizationBranding).not.toHaveBeenCalled();
  });
});
