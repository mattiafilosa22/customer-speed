import { describe, expect, it } from "vitest";

import { NotFoundError } from "@/lib/errors";
import { INDIGO_THEME } from "@/lib/theme";
import { THEME_PRESETS } from "@/lib/theme-presets";
import { getOrganizationBranding } from "@/server/organization/get-branding";
import {
  OrganizationStore,
  buildFakeOrganizationDeps,
} from "@/server/organization/test-helpers";

const ORG_A = "org_a";

describe("getOrganizationBranding", () => {
  it("returns the tenant's branding with a parsed theme", async () => {
    const store = new OrganizationStore();
    store.seed({ id: ORG_A, appName: "Fabio", theme: THEME_PRESETS.violet, markFallback: "FB" });
    const { deps } = buildFakeOrganizationDeps(store, ORG_A);

    const result = await getOrganizationBranding(deps);

    expect(result.appName).toBe("Fabio");
    expect(result.theme.preset).toBe("violet");
    expect(result.markFallback).toBe("FB");
    expect(result.poweredBy).toBe(true);
  });

  it("falls back to the Indigo default on a malformed theme JSON", async () => {
    const store = new OrganizationStore();
    store.seed({ id: ORG_A, theme: { nonsense: true } });
    const { deps } = buildFakeOrganizationDeps(store, ORG_A);

    const result = await getOrganizationBranding(deps);
    expect(result.theme).toEqual(INDIGO_THEME);
  });

  it("throws NotFound when the org row is missing", async () => {
    const store = new OrganizationStore();
    const { deps } = buildFakeOrganizationDeps(store, "org_missing");

    await expect(getOrganizationBranding(deps)).rejects.toBeInstanceOf(NotFoundError);
  });
});
