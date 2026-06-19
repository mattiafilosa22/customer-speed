import { describe, expect, it } from "vitest";

import { ValidationError } from "@/lib/errors";
import { updateOrganizationBranding } from "@/server/organization/update-branding";
import {
  OrganizationStore,
  buildFakeOrganizationDeps,
} from "@/server/organization/test-helpers";

const ORG_A = "org_a";
const ORG_B = "org_b";

describe("updateOrganizationBranding", () => {
  it("updates appName/mark/poweredBy and audits (happy path)", async () => {
    const store = new OrganizationStore();
    store.seed({ id: ORG_A, appName: "Old", poweredBy: true });
    const { deps, audits } = buildFakeOrganizationDeps(store, ORG_A);

    await updateOrganizationBranding(deps, {
      appName: "Fabio Consulting",
      markFallback: "fc",
      poweredBy: false,
    });

    const row = store.get(ORG_A);
    expect(row?.appName).toBe("Fabio Consulting");
    expect(row?.markFallback).toBe("FC"); // upper-cased by the schema
    expect(row?.poweredBy).toBe(false);
    expect(audits.some((a) => a.action === "settings.branding.update")).toBe(true);
  });

  it("rejects an empty appName", async () => {
    const store = new OrganizationStore();
    store.seed({ id: ORG_A });
    const { deps } = buildFakeOrganizationDeps(store, ORG_A);

    await expect(
      updateOrganizationBranding(deps, { appName: "   ", poweredBy: true }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects a mark longer than 3 characters", async () => {
    const store = new OrganizationStore();
    store.seed({ id: ORG_A });
    const { deps } = buildFakeOrganizationDeps(store, ORG_A);

    await expect(
      updateOrganizationBranding(deps, { appName: "A", markFallback: "ABCD", poweredBy: true }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects a non-image logo reference (anti-injection)", async () => {
    const store = new OrganizationStore();
    store.seed({ id: ORG_A });
    const { deps } = buildFakeOrganizationDeps(store, ORG_A);

    await expect(
      updateOrganizationBranding(deps, {
        appName: "A",
        logoUrl: "javascript:alert(1)",
        poweredBy: true,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("accepts a PNG data URL logo and clears favicon with null", async () => {
    const store = new OrganizationStore();
    store.seed({ id: ORG_A, faviconUrl: "data:image/png;base64,AAAA" });
    const { deps } = buildFakeOrganizationDeps(store, ORG_A);

    await updateOrganizationBranding(deps, {
      appName: "A",
      logoUrl: "data:image/png;base64,iVBORw0KGgo=",
      faviconUrl: null,
      poweredBy: true,
    });

    expect(store.get(ORG_A)?.logoUrl).toContain("data:image/png");
    expect(store.get(ORG_A)?.faviconUrl).toBeNull();
  });

  it("only ever writes the actor's own organization (cross-tenant isolation)", async () => {
    const store = new OrganizationStore();
    store.seed({ id: ORG_A, appName: "A-name" });
    store.seed({ id: ORG_B, appName: "B-name" });
    const { deps } = buildFakeOrganizationDeps(store, ORG_B);

    await updateOrganizationBranding(deps, { appName: "B-renamed", poweredBy: true });

    expect(store.get(ORG_B)?.appName).toBe("B-renamed");
    expect(store.get(ORG_A)?.appName).toBe("A-name"); // untouched
  });
});
