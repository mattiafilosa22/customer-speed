import { beforeEach, describe, expect, it, vi } from "vitest";

import { UnauthorizedError } from "@/lib/errors";

/**
 * Tests for the cross-tenant ADMIN Server Actions. Focus on the AUTHZ chain
 * (docs/00 §4): every action must resolve a superAdmin context AND re-check the
 * `admin.tenants` capability server-side, regardless of the layout guard
 * (defense in depth). A tenant user (proUser/baseUser) reaching an admin action
 * is rejected — it never reaches the use case.
 *
 * The use cases, the deps builders and the context are mocked so these tests
 * isolate the boundary behaviour.
 */

const requireSuperAdminContext = vi.fn();
vi.mock("@/lib/tenant", () => ({
  requireSuperAdminContext: () => requireSuperAdminContext(),
}));

const createOrganization = vi.fn();
const updateOrganization = vi.fn();
const updateOrganizationFeatureFlags = vi.fn();
const setOrganizationActive = vi.fn();
const createUser = vi.fn();
const updateUser = vi.fn();
const resetUserPassword = vi.fn();

vi.mock("@/server/admin", () => ({
  buildAdminDeps: vi.fn(() => ({})),
  buildOrganizationDepsForTarget: vi.fn(() => ({})),
  createOrganization: (...a: unknown[]) => createOrganization(...a),
  updateOrganization: (...a: unknown[]) => updateOrganization(...a),
  updateOrganizationFeatureFlags: (...a: unknown[]) => updateOrganizationFeatureFlags(...a),
  setOrganizationActive: (...a: unknown[]) => setOrganizationActive(...a),
  createUser: (...a: unknown[]) => createUser(...a),
  updateUser: (...a: unknown[]) => updateUser(...a),
  resetUserPassword: (...a: unknown[]) => resetUserPassword(...a),
}));

const updateOrganizationTheme = vi.fn();
const updateOrganizationBranding = vi.fn();
vi.mock("@/server/organization", () => ({
  updateOrganizationTheme: (...a: unknown[]) => updateOrganizationTheme(...a),
  updateOrganizationBranding: (...a: unknown[]) => updateOrganizationBranding(...a),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  createOrganizationAction,
  createUserAction,
  setOrganizationActiveAction,
  updateFeatureFlagsAction,
  updateOrganizationAction,
  updateTenantThemeAction,
} from "@/app/(admin)/admin/actions";

const SUPERADMIN = { kind: "superAdmin" as const, userId: "sa_1", role: "superAdmin" as const };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("admin actions — superAdmin happy paths", () => {
  beforeEach(() => requireSuperAdminContext.mockResolvedValue(SUPERADMIN));

  it("createOrganizationAction returns the new org id", async () => {
    createOrganization.mockResolvedValue({ organizationId: "org_new", ownerUserId: "u1" });
    const result = await createOrganizationAction({
      name: "Acme",
      slug: "acme",
      appName: "Acme",
      owner: { name: "O", email: "o@acme.test" },
    });
    expect(result).toEqual({ ok: true, organizationId: "org_new" });
    expect(createOrganization).toHaveBeenCalledOnce();
  });

  it("updateFeatureFlagsAction calls the use case", async () => {
    updateOrganizationFeatureFlags.mockResolvedValue({ ok: true });
    await updateFeatureFlagsAction({
      organizationId: "org_1",
      flags: {
        leads: true,
        pipeline: true,
        dashboard: true,
        appointments: true,
        invoices: true,
        calendarIntegrations: false,
      },
    });
    expect(updateOrganizationFeatureFlags).toHaveBeenCalledOnce();
  });

  it("updateTenantThemeAction reuses the white-label use case for the target org", async () => {
    updateOrganizationTheme.mockResolvedValue({ ok: true });
    await updateTenantThemeAction("org_target", { theme: {} as never });
    expect(updateOrganizationTheme).toHaveBeenCalledOnce();
  });
});

describe("admin actions — non-superAdmin is rejected (403/unauthorized)", () => {
  beforeEach(() => {
    // A tenant user reaching an admin action: requireSuperAdminContext throws.
    requireSuperAdminContext.mockRejectedValue(new UnauthorizedError("SuperAdmin context required"));
  });

  const cases: Array<[string, () => Promise<unknown>]> = [
    ["createOrganizationAction", () =>
      createOrganizationAction({
        name: "x",
        slug: "x",
        appName: "x",
        owner: { name: "x", email: "x@x.test" },
      })],
    ["updateOrganizationAction", () => updateOrganizationAction({ organizationId: "o" })],
    ["setOrganizationActiveAction", () =>
      setOrganizationActiveAction({ organizationId: "o", active: false })],
    ["createUserAction", () =>
      createUserAction({ organizationId: "o", name: "n", email: "n@x.test", role: "baseUser" })],
    ["updateTenantThemeAction", () => updateTenantThemeAction("o", { theme: {} as never })],
  ];

  it.each(cases)("%s throws the unauthorized key and never calls a use case", async (_name, run) => {
    await expect(run()).rejects.toThrow("admin.errors.unauthorized");
    expect(createOrganization).not.toHaveBeenCalled();
    expect(updateOrganization).not.toHaveBeenCalled();
    expect(setOrganizationActive).not.toHaveBeenCalled();
    expect(createUser).not.toHaveBeenCalled();
    expect(updateOrganizationTheme).not.toHaveBeenCalled();
  });
});

describe("admin actions — error mapping", () => {
  beforeEach(() => requireSuperAdminContext.mockResolvedValue(SUPERADMIN));

  it("maps a ConflictError message to a stable i18n key", async () => {
    const { ConflictError } = await import("@/lib/errors");
    createOrganization.mockRejectedValue(new ConflictError("slug.taken"));
    await expect(
      createOrganizationAction({
        name: "x",
        slug: "x",
        appName: "x",
        owner: { name: "x", email: "x@x.test" },
      }),
    ).rejects.toThrow("admin.errors.slug.taken");
  });

  it("maps a ValidationError to the invalid key", async () => {
    const { ValidationError } = await import("@/lib/errors");
    createUser.mockRejectedValue(new ValidationError({ email: ["bad"] }));
    await expect(
      createUserAction({ organizationId: "o", name: "n", email: "n@x.test", role: "baseUser" }),
    ).rejects.toThrow("admin.errors.invalid");
  });
});
