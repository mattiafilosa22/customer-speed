import { describe, expect, it } from "vitest";

import { can, CAPABILITIES, ForbiddenError, requirePermission, type Capability } from "@/lib/rbac";

describe("rbac", () => {
  it("grants proUser the operational tenant capabilities", () => {
    expect(can("proUser", "lead.delete")).toBe(true);
    expect(can("proUser", "invoice.create")).toBe(true);
    expect(can("proUser", "settings.tenant")).toBe(true);
    expect(can("proUser", "pipeline.configureStages")).toBe(true);
  });

  it("denies baseUser the restricted capabilities (docs/02 matrix)", () => {
    expect(can("baseUser", "lead.delete")).toBe(false);
    expect(can("baseUser", "invoice.create")).toBe(false);
    expect(can("baseUser", "pipeline.configureStages")).toBe(false);
    expect(can("baseUser", "users.manage")).toBe(false);
    expect(can("baseUser", "admin.tenants")).toBe(false);
  });

  it("grants baseUser read + move + create/update", () => {
    expect(can("baseUser", "lead.view")).toBe(true);
    expect(can("baseUser", "lead.create")).toBe(true);
    expect(can("baseUser", "lead.update")).toBe(true);
    expect(can("baseUser", "pipeline.move")).toBe(true);
    expect(can("baseUser", "dashboard.view")).toBe(true);
  });

  it("reserves GDPR DSR (export/erasure) to proUser/superAdmin, not baseUser", () => {
    expect(can("superAdmin", "lead.exportData")).toBe(true);
    expect(can("superAdmin", "lead.eraseData")).toBe(true);
    expect(can("proUser", "lead.exportData")).toBe(true);
    expect(can("proUser", "lead.eraseData")).toBe(true);
    expect(can("baseUser", "lead.exportData")).toBe(false);
    expect(can("baseUser", "lead.eraseData")).toBe(false);
  });

  it("reserves admin.tenants for superAdmin only", () => {
    expect(can("superAdmin", "admin.tenants")).toBe(true);
    expect(can("proUser", "admin.tenants")).toBe(false);
    expect(can("baseUser", "admin.tenants")).toBe(false);
  });

  it("requirePermission throws ForbiddenError (403) when denied", () => {
    expect(() => requirePermission("baseUser", "lead.delete")).toThrowError(ForbiddenError);
    try {
      requirePermission("baseUser", "invoice.create");
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ForbiddenError);
      expect((error as ForbiddenError).status).toBe(403);
      expect((error as ForbiddenError).capability).toBe("invoice.create");
    }
  });

  it("requirePermission is a no-op when allowed", () => {
    expect(() => requirePermission("proUser", "lead.delete")).not.toThrow();
  });

  it("every capability is granted to at least one role (no dead capability)", () => {
    const roles = ["superAdmin", "proUser", "baseUser"] as const;
    for (const cap of CAPABILITIES) {
      const grantedToSomeone = roles.some((r) => can(r, cap as Capability));
      expect(grantedToSomeone, `capability ${cap} is unreachable`).toBe(true);
    }
  });
});
