import { describe, expect, it } from "vitest";

import { ValidationError } from "@/lib/errors";
import { INDIGO_THEME, type Theme } from "@/lib/theme";
import { THEME_PRESETS } from "@/lib/theme-presets";
import { updateOrganizationTheme } from "@/server/organization/update-theme";
import {
  OrganizationStore,
  buildFakeOrganizationDeps,
} from "@/server/organization/test-helpers";

const ORG_A = "org_a";
const ORG_B = "org_b";

describe("updateOrganizationTheme", () => {
  it("persists a valid, AA-compliant theme and audits (happy path)", async () => {
    const store = new OrganizationStore();
    store.seed({ id: ORG_A, theme: INDIGO_THEME });
    const { deps, audits } = buildFakeOrganizationDeps(store, ORG_A);

    await updateOrganizationTheme(deps, { theme: THEME_PRESETS.teal });

    expect((store.get(ORG_A)?.theme as Theme).preset).toBe("teal");
    expect(audits.some((a) => a.action === "settings.theme.update")).toBe(true);
  });

  it("rejects a malformed theme with a ValidationError", async () => {
    const store = new OrganizationStore();
    store.seed({ id: ORG_A, theme: INDIGO_THEME });
    const { deps } = buildFakeOrganizationDeps(store, ORG_A);

    await expect(
      updateOrganizationTheme(deps, { theme: { preset: "indigo", radius: 999 } }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("BLOCKS a theme whose critical contrast is below AA", async () => {
    const store = new OrganizationStore();
    store.seed({ id: ORG_A, theme: INDIGO_THEME });
    const { deps } = buildFakeOrganizationDeps(store, ORG_A);

    const lowContrast: Theme = {
      ...INDIGO_THEME,
      colors: { ...INDIGO_THEME.colors, accent: "#f1c40f" }, // white text fails on yellow
    };

    await expect(
      updateOrganizationTheme(deps, { theme: lowContrast }),
    ).rejects.toBeInstanceOf(ValidationError);

    // Not persisted: the org keeps its original theme.
    expect((store.get(ORG_A)?.theme as Theme).colors.accent).toBe(INDIGO_THEME.colors.accent);
  });

  it("does NOT block on the advisory muted warning (Indigo default saves)", async () => {
    const store = new OrganizationStore();
    store.seed({ id: ORG_A, theme: {} });
    const { deps } = buildFakeOrganizationDeps(store, ORG_A);

    await expect(
      updateOrganizationTheme(deps, { theme: INDIGO_THEME }),
    ).resolves.toEqual({ ok: true });
  });

  it("only ever writes the actor's own organization (cross-tenant isolation)", async () => {
    const store = new OrganizationStore();
    store.seed({ id: ORG_A, theme: INDIGO_THEME });
    store.seed({ id: ORG_B, theme: INDIGO_THEME });
    // Actor is bound to ORG_B; it must never touch ORG_A.
    const { deps } = buildFakeOrganizationDeps(store, ORG_B);

    await updateOrganizationTheme(deps, { theme: THEME_PRESETS.coral });

    expect((store.get(ORG_B)?.theme as Theme).preset).toBe("coral");
    expect((store.get(ORG_A)?.theme as Theme).preset).toBe("indigo"); // untouched
  });
});
