import { describe, expect, it } from "vitest";

import { resolveRetentionMonths } from "@/server/privacy/retention-months";
import { buildExportFake, PrivacyStore } from "@/server/privacy/test-helpers";

const ORG_A = "org_a";
const ORG_B = "org_b";

describe("resolveRetentionMonths", () => {
  it("an explicit override wins over the tenant's configured value", async () => {
    const store = new PrivacyStore();
    store.setOrganization({ id: ORG_A, leadRetentionMonths: 12 });
    const { deps } = buildExportFake(store, ORG_A);

    await expect(resolveRetentionMonths(deps, 3)).resolves.toBe(3);
  });

  it("falls back to the tenant's Organization.leadRetentionMonths when no override", async () => {
    const store = new PrivacyStore();
    store.setOrganization({ id: ORG_A, leadRetentionMonths: 18 });
    const { deps } = buildExportFake(store, ORG_A);

    await expect(resolveRetentionMonths(deps)).resolves.toBe(18);
  });

  it("returns null (not an error) when retention is not configured for the tenant", async () => {
    const store = new PrivacyStore();
    store.setOrganization({ id: ORG_A, leadRetentionMonths: null });
    const { deps } = buildExportFake(store, ORG_A);

    await expect(resolveRetentionMonths(deps)).resolves.toBeNull();
  });

  it("returns null when the organization row is missing entirely", async () => {
    const store = new PrivacyStore();
    const { deps } = buildExportFake(store, ORG_A);

    await expect(resolveRetentionMonths(deps)).resolves.toBeNull();
  });

  it("isolation: never reads another tenant's configured retention window", async () => {
    const store = new PrivacyStore();
    store.setOrganization({ id: ORG_A, leadRetentionMonths: null });
    store.setOrganization({ id: ORG_B, leadRetentionMonths: 6 });
    const { deps } = buildExportFake(store, ORG_A);

    await expect(resolveRetentionMonths(deps)).resolves.toBeNull();
  });
});
