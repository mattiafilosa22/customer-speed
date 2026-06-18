import { afterEach, describe, expect, it, vi } from "vitest";

import { ForbiddenError } from "@/lib/rbac";
import { UnauthorizedError } from "@/lib/errors";

/**
 * `leadRouteContext` is the shared auth→RBAC→tenant prefix for the lead routes.
 * It must: (1) throw Unauthorized when there is no tenant context, (2) throw
 * Forbidden when the role lacks the capability, (3) build tenant-scoped deps on
 * success. We mock the context + deps builder to assert the ORDER and wiring.
 */

const requireTenantContext = vi.fn();
const buildLeadDeps = vi.fn();

vi.mock("@/lib/tenant", () => ({
  requireTenantContext: (...a: unknown[]) => requireTenantContext(...a),
}));
vi.mock("@/server/leads", () => ({
  buildLeadDeps: (...a: unknown[]) => buildLeadDeps(...a),
}));

import { leadRouteContext } from "@/server/api/lead-route-context";

afterEach(() => vi.clearAllMocks());

describe("leadRouteContext", () => {
  it("throws Unauthorized when there is no tenant context (before RBAC)", async () => {
    requireTenantContext.mockRejectedValue(new UnauthorizedError());
    await expect(leadRouteContext("lead.view")).rejects.toBeInstanceOf(UnauthorizedError);
    expect(buildLeadDeps).not.toHaveBeenCalled();
  });

  it("throws Forbidden when the role lacks the capability (baseUser + lead.delete)", async () => {
    requireTenantContext.mockResolvedValue({
      kind: "tenant",
      role: "baseUser",
      organizationId: "o",
      userId: "u",
    });
    await expect(leadRouteContext("lead.delete")).rejects.toBeInstanceOf(ForbiddenError);
    expect(buildLeadDeps).not.toHaveBeenCalled();
  });

  it("builds tenant-scoped deps when authorized (proUser + lead.delete)", async () => {
    const ctx = { kind: "tenant", role: "proUser", organizationId: "o", userId: "u" };
    requireTenantContext.mockResolvedValue(ctx);
    buildLeadDeps.mockReturnValue({ deps: true });

    const deps = await leadRouteContext("lead.delete");
    expect(buildLeadDeps).toHaveBeenCalledWith(ctx);
    expect(deps).toEqual({ deps: true });
  });
});
