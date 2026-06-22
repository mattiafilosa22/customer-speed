import { beforeEach, describe, expect, it, vi } from "vitest";

import { UnauthorizedError, ValidationError } from "@/lib/errors";

/**
 * Tests for the authenticated-area account actions. Focus: the actor is taken
 * from the SERVER context (never the client), auth-missing maps to the
 * unauthorized key, and invalid input maps to field keys. The use case + auth
 * + headers are mocked.
 */

const changePassword = vi.fn();
vi.mock("@/server/auth", () => ({
  buildAuthDeps: vi.fn(() => ({})),
  changePassword: (...a: unknown[]) => changePassword(...a),
}));

const requireTenantContext = vi.fn();
const getTenantContext = vi.fn();
vi.mock("@/lib/tenant", () => ({
  requireTenantContext: () => requireTenantContext(),
  getTenantContext: () => getTenantContext(),
}));

const orgFindUnique = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { organization: { findUnique: (...a: unknown[]) => orgFindUnique(...a) } },
}));

vi.mock("@/server/audit/audit-log", () => ({
  createAuditLogger: () => ({ record: vi.fn(async () => {}) }),
}));

const signOut = vi.fn();
vi.mock("@/lib/auth", () => ({ signOut: (...a: unknown[]) => signOut(...a) }));

vi.mock("@/server/actions/request-meta", () => ({
  getRequestMeta: vi.fn(async () => ({ ip: "1.2.3.4", userAgent: "vitest" })),
}));

class RedirectSignal extends Error {}
const redirectMock = vi.fn();
vi.mock("@/i18n/navigation", () => ({
  redirect: (arg: unknown) => {
    redirectMock(arg);
    throw new RedirectSignal();
  },
}));
vi.mock("next/navigation", () => ({ unstable_rethrow: () => {} }));

import { changePasswordAction, logoutAction } from "@/app/[locale]/(app)/account-actions";

const idle = { status: "idle" } as const;

function fd(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("changePasswordAction", () => {
  const valid = { currentPassword: "OldPassword1", newPassword: "NewPassword1" };

  it("uses the SERVER context actor and succeeds", async () => {
    requireTenantContext.mockResolvedValue({
      kind: "tenant",
      userId: "u1",
      organizationId: "org_fabio",
      role: "proUser",
    });
    changePassword.mockResolvedValue({ sessionVersion: 2 });

    const result = await changePasswordAction(idle, fd(valid));

    expect(result).toEqual({ status: "success", messageKey: "auth.changePassword.success" });
    // Actor comes from context, not from the form.
    expect(changePassword).toHaveBeenCalledWith(
      {},
      { userId: "u1", organizationId: "org_fabio" },
      expect.objectContaining({ currentPassword: "OldPassword1", newPassword: "NewPassword1" }),
    );
  });

  it("maps a missing session (UnauthorizedError) to the unauthorized key", async () => {
    requireTenantContext.mockRejectedValue(new UnauthorizedError("No active session"));
    const result = await changePasswordAction(idle, fd(valid));
    expect(result).toEqual({
      status: "error",
      formError: "auth.changePassword.errors.unauthorized",
    });
    expect(changePassword).not.toHaveBeenCalled();
  });

  it("maps a wrong current password (UnauthorizedError) to the unauthorized key", async () => {
    requireTenantContext.mockResolvedValue({
      kind: "tenant",
      userId: "u1",
      organizationId: "org_fabio",
      role: "proUser",
    });
    changePassword.mockRejectedValue(new UnauthorizedError("Current password is incorrect"));
    const result = await changePasswordAction(idle, fd(valid));
    expect(result).toEqual({
      status: "error",
      formError: "auth.changePassword.errors.unauthorized",
    });
  });

  it("maps invalid input to per-field keys", async () => {
    requireTenantContext.mockResolvedValue({
      kind: "tenant",
      userId: "u1",
      organizationId: "org_fabio",
      role: "proUser",
    });
    changePassword.mockRejectedValue(new ValidationError({ newPassword: ["too short"] }));
    const result = await changePasswordAction(idle, fd(valid));
    expect(result).toEqual({
      status: "error",
      fieldErrors: { newPassword: "auth.errors.fields.newPassword" },
    });
  });
});

describe("logoutAction", () => {
  it("signs out then redirects back to the SAME tenant login (?org=slug)", async () => {
    signOut.mockResolvedValue(undefined);
    getTenantContext.mockResolvedValue({
      kind: "tenant",
      userId: "u1",
      organizationId: "org_fabio",
      role: "proUser",
    });
    orgFindUnique.mockResolvedValue({ slug: "fabio" });

    await expect(logoutAction(fd({ locale: "it" }))).rejects.toBeInstanceOf(RedirectSignal);

    expect(signOut).toHaveBeenCalledWith({ redirect: false });
    expect(redirectMock).toHaveBeenCalledWith({
      href: { pathname: "/login", query: { org: "fabio" } },
      locale: "it",
    });
  });

  it("falls back to the bare login when the tenant cannot be resolved", async () => {
    signOut.mockResolvedValue(undefined);
    // No session / lookup fails → best-effort path, plain /login.
    getTenantContext.mockRejectedValue(new UnauthorizedError("No active session"));

    await expect(logoutAction(fd({ locale: "en" }))).rejects.toBeInstanceOf(RedirectSignal);

    expect(signOut).toHaveBeenCalledWith({ redirect: false });
    expect(redirectMock).toHaveBeenCalledWith({ href: "/login", locale: "en" });
  });
});
