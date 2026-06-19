import { describe, expect, it } from "vitest";

import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { getOrganization } from "@/server/admin/get-organization";
import {
  setOrganizationActive,
  updateOrganization,
  updateOrganizationFeatureFlags,
} from "@/server/admin/update-organization";
import { AdminFakeDb, buildFakeAdminDeps } from "@/server/admin/test-helpers";

describe("admin/getOrganization", () => {
  it("returns identity + parsed flags + counts", async () => {
    const db = new AdminFakeDb();
    const org = db.addOrg({
      slug: "acme",
      name: "Acme",
      featureFlags: { invoices: false },
    });
    db.addUser({ organizationId: org.id, email: "u@a.test", role: "proUser" });
    db.addUser({ organizationId: org.id, email: "sa@a.test", role: "superAdmin" }); // excluded

    const detail = await getOrganization(buildFakeAdminDeps(db), { organizationId: org.id });
    expect(detail.name).toBe("Acme");
    expect(detail.featureFlags.invoices).toBe(false);
    expect(detail.featureFlags.leads).toBe(true); // default fill
    expect(detail.userCount).toBe(1);
  });

  it("throws NotFound for an unknown org", async () => {
    const db = new AdminFakeDb();
    await expect(
      getOrganization(buildFakeAdminDeps(db), { organizationId: "nope" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("admin/updateOrganization", () => {
  it("updates identity fields and audits", async () => {
    const db = new AdminFakeDb();
    const org = db.addOrg({ slug: "acme", name: "Acme" });
    await updateOrganization(buildFakeAdminDeps(db), {
      organizationId: org.id,
      name: "Acme Renamed",
      appName: "New App",
    });
    expect(db.org().name).toBe("Acme Renamed");
    expect(db.org().appName).toBe("New App");
    expect(db.audits.some((a) => a.action === "admin.organization.update")).toBe(true);
  });

  it("rejects a slug already used by ANOTHER tenant (cross-tenant uniqueness)", async () => {
    const db = new AdminFakeDb();
    const a = db.addOrg({ slug: "alpha" });
    db.addOrg({ slug: "bravo" });
    await expect(
      updateOrganization(buildFakeAdminDeps(db), { organizationId: a.id, slug: "bravo" }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("allows keeping the same slug on the same tenant", async () => {
    const db = new AdminFakeDb();
    const a = db.addOrg({ slug: "alpha" });
    await expect(
      updateOrganization(buildFakeAdminDeps(db), { organizationId: a.id, slug: "alpha" }),
    ).resolves.toEqual({ ok: true });
  });

  it("rejects an invalid slug", async () => {
    const db = new AdminFakeDb();
    const a = db.addOrg({ slug: "alpha" });
    await expect(
      updateOrganization(buildFakeAdminDeps(db), { organizationId: a.id, slug: "X!" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("admin/updateOrganizationFeatureFlags", () => {
  it("persists normalized flags and audits", async () => {
    const db = new AdminFakeDb();
    const org = db.addOrg({ slug: "acme" });
    await updateOrganizationFeatureFlags(buildFakeAdminDeps(db), {
      organizationId: org.id,
      flags: {
        leads: true,
        pipeline: true,
        dashboard: true,
        appointments: false,
        invoices: false,
        calendarIntegrations: true,
      },
    });
    const flags = db.org().featureFlags as Record<string, boolean>;
    expect(flags.calendarIntegrations).toBe(true);
    expect(flags.invoices).toBe(false);
    expect(db.audits.some((a) => a.action === "admin.organization.featureFlags.update")).toBe(true);
  });

  it("rejects a malformed flags payload", async () => {
    const db = new AdminFakeDb();
    const org = db.addOrg({ slug: "acme" });
    await expect(
      updateOrganizationFeatureFlags(buildFakeAdminDeps(db), {
        organizationId: org.id,
        // missing required keys
        flags: { leads: true },
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("admin/setOrganizationActive", () => {
  it("suspends a tenant by deactivating its users + bumping sessionVersion", async () => {
    const db = new AdminFakeDb();
    const org = db.addOrg({ slug: "acme" });
    const u = db.addUser({ organizationId: org.id, email: "u@a.test", isActive: true });
    const sa = db.addUser({ organizationId: org.id, email: "sa@a.test", role: "superAdmin" });

    await setOrganizationActive(buildFakeAdminDeps(db), {
      organizationId: org.id,
      active: false,
    });

    expect(db.users.find((x) => x.id === u.id)!.isActive).toBe(false);
    expect(db.users.find((x) => x.id === u.id)!.sessionVersion).toBe(1);
    // superAdmin untouched.
    expect(db.users.find((x) => x.id === sa.id)!.isActive).toBe(true);
    expect(db.audits.some((a) => a.action === "admin.organization.suspend")).toBe(true);
  });

  it("reactivates a tenant", async () => {
    const db = new AdminFakeDb();
    const org = db.addOrg({ slug: "acme" });
    const u = db.addUser({ organizationId: org.id, email: "u@a.test", isActive: false });
    await setOrganizationActive(buildFakeAdminDeps(db), { organizationId: org.id, active: true });
    expect(db.users.find((x) => x.id === u.id)!.isActive).toBe(true);
    expect(db.audits.some((a) => a.action === "admin.organization.activate")).toBe(true);
  });

  it("throws NotFound for an unknown org", async () => {
    const db = new AdminFakeDb();
    await expect(
      setOrganizationActive(buildFakeAdminDeps(db), { organizationId: "nope", active: false }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
