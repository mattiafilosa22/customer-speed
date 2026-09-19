import { describe, expect, it } from "vitest";

import { getInsightConfig } from "@/server/insight/config";
import { InsightStore } from "@/server/insight/test-helpers";

describe("getInsightConfig", () => {
  it("returns the linked source and the activation boundary", async () => {
    const store = new InsightStore();
    const source = store.addLeadSource({ organizationId: "org-a", label: "Instagram" });
    store.addOrganization({
      id: "org-a",
      insightSourceId: source.id,
      insightActiveFrom: new Date(Date.UTC(2026, 8, 1)),
    });

    const config = await getInsightConfig(store.deps("org-a"));

    expect(config).toEqual({ sourceId: source.id, activeFrom: new Date(Date.UTC(2026, 8, 1)) });
  });

  it("returns null when no source is linked — the section is unconfigured", async () => {
    const store = new InsightStore();
    store.addOrganization({ id: "org-a", insightSourceId: null });

    expect(await getInsightConfig(store.deps("org-a"))).toBeNull();
  });

  it("never reads another tenant's configuration", async () => {
    const store = new InsightStore();
    const source = store.addLeadSource({ organizationId: "org-b", label: "Instagram" });
    store.addOrganization({ id: "org-b", insightSourceId: source.id });
    store.addOrganization({ id: "org-a", insightSourceId: null });

    expect(await getInsightConfig(store.deps("org-a"))).toBeNull();
  });
});
