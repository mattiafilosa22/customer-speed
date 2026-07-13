import { describe, expect, it } from "vitest";

import { ValidationError } from "@/lib/errors";
import { updateOrganizationRetention } from "@/server/organization/update-retention";
import { OrganizationStore, buildFakeOrganizationDeps } from "@/server/organization/test-helpers";

const ORG_A = "org_a";
const ORG_B = "org_b";

describe("updateOrganizationRetention", () => {
  it("happy path: persists a positive retention window and audits it", async () => {
    const store = new OrganizationStore();
    store.seed({ id: ORG_A, leadRetentionMonths: null });
    const { deps, audits } = buildFakeOrganizationDeps(store, ORG_A);

    const result = await updateOrganizationRetention(deps, { leadRetentionMonths: 12 });

    expect(result).toEqual({ ok: true });
    expect(store.get(ORG_A)?.leadRetentionMonths).toBe(12);
    expect(audits).toHaveLength(1);
    expect(audits[0]?.action).toBe("settings.retention.update");
    expect(audits[0]?.meta).toEqual({ leadRetentionMonths: 12 });
  });

  it("null disables the retention policy for the tenant", async () => {
    const store = new OrganizationStore();
    store.seed({ id: ORG_A, leadRetentionMonths: 24 });
    const { deps } = buildFakeOrganizationDeps(store, ORG_A);

    await updateOrganizationRetention(deps, { leadRetentionMonths: null });

    expect(store.get(ORG_A)?.leadRetentionMonths).toBeNull();
  });

  it("rejects a non-integer value", async () => {
    const store = new OrganizationStore();
    store.seed({ id: ORG_A });
    const { deps } = buildFakeOrganizationDeps(store, ORG_A);

    await expect(
      updateOrganizationRetention(deps, { leadRetentionMonths: 3.5 }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects zero and negative values", async () => {
    const store = new OrganizationStore();
    store.seed({ id: ORG_A });
    const { deps } = buildFakeOrganizationDeps(store, ORG_A);

    await expect(
      updateOrganizationRetention(deps, { leadRetentionMonths: 0 }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      updateOrganizationRetention(deps, { leadRetentionMonths: -1 }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects a value above the 120-month cap", async () => {
    const store = new OrganizationStore();
    store.seed({ id: ORG_A });
    const { deps } = buildFakeOrganizationDeps(store, ORG_A);

    await expect(
      updateOrganizationRetention(deps, { leadRetentionMonths: 121 }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("only ever writes the actor's own organization (cross-tenant isolation)", async () => {
    const store = new OrganizationStore();
    store.seed({ id: ORG_A, leadRetentionMonths: 6 });
    store.seed({ id: ORG_B, leadRetentionMonths: 6 });
    const { deps } = buildFakeOrganizationDeps(store, ORG_B);

    await updateOrganizationRetention(deps, { leadRetentionMonths: 18 });

    expect(store.get(ORG_B)?.leadRetentionMonths).toBe(18);
    expect(store.get(ORG_A)?.leadRetentionMonths).toBe(6); // untouched
  });
});
