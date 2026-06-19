import { afterEach, describe, expect, it, vi } from "vitest";

import { ForbiddenError } from "@/lib/rbac";
import { NotFoundError, UnauthorizedError } from "@/lib/errors";

/**
 * Unit tests for the calendar route guard: auth → RBAC (`calendar.integrations`)
 * → feature flag. Covers the mandatory negatives (docs/00 §5): missing auth,
 * permission denied (baseUser), and feature flag OFF (Fabio) → 404.
 */

const requireTenantContext = vi.fn();
const getTenantFeatureFlags = vi.fn();

vi.mock("@/lib/tenant", () => ({
  requireTenantContext: (...a: unknown[]) => requireTenantContext(...a),
}));
vi.mock("@/server/tenant/feature-flags", () => ({
  getTenantFeatureFlags: (...a: unknown[]) => getTenantFeatureFlags(...a),
}));

import { requireCalendarContext } from "@/server/calendar/route-guard";

const proCtx = { kind: "tenant", organizationId: "org_a", userId: "u1", role: "proUser" };
const baseCtx = { kind: "tenant", organizationId: "org_a", userId: "u2", role: "baseUser" };

afterEach(() => vi.clearAllMocks());

describe("requireCalendarContext", () => {
  it("returns the context for a proUser when the flag is ON (happy path)", async () => {
    requireTenantContext.mockResolvedValue(proCtx);
    getTenantFeatureFlags.mockResolvedValue({ calendarIntegrations: true });

    const ctx = await requireCalendarContext();
    expect(ctx).toBe(proCtx);
  });

  it("propagates UnauthorizedError when there is no session (401)", async () => {
    requireTenantContext.mockRejectedValue(new UnauthorizedError());
    await expect(requireCalendarContext()).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("DENIES baseUser (no calendar.integrations capability → 403)", async () => {
    requireTenantContext.mockResolvedValue(baseCtx);
    getTenantFeatureFlags.mockResolvedValue({ calendarIntegrations: true });

    await expect(requireCalendarContext()).rejects.toBeInstanceOf(ForbiddenError);
    // The flag must not even be consulted before RBAC passes.
    expect(getTenantFeatureFlags).not.toHaveBeenCalled();
  });

  it("404s when the tenant flag is OFF (Fabio) — module unavailable", async () => {
    requireTenantContext.mockResolvedValue(proCtx);
    getTenantFeatureFlags.mockResolvedValue({ calendarIntegrations: false });

    await expect(requireCalendarContext()).rejects.toBeInstanceOf(NotFoundError);
  });
});
