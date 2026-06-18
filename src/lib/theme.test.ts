import { describe, expect, it } from "vitest";

import { INDIGO_THEME, resolveTheme, themeSchema, themeToCssVars } from "@/lib/theme";

describe("theme", () => {
  it("Indigo preset is a valid, complete theme", () => {
    expect(themeSchema.safeParse(INDIGO_THEME).success).toBe(true);
    expect(INDIGO_THEME.preset).toBe("indigo");
    expect(INDIGO_THEME.mode).toBe("light");
    expect(INDIGO_THEME.radius).toBe(12);
  });

  it("themeToCssVars emits the runtime custom properties", () => {
    const vars = themeToCssVars(INDIGO_THEME);
    expect(vars["--accent"]).toBe("#5b5bd6");
    expect(vars["--accent-ink"]).toBe("#4a48c4");
    expect(vars["--radius"]).toBe("12px");
    // Stage tokens are mapped from the enum-keyed stageColors.
    expect(vars["--stage-taken"]).toBe("#5b5bd6");
    expect(vars["--stage-lost"]).toBe("#e5533b");
  });

  it("rejects invalid hex colors", () => {
    const bad = { ...INDIGO_THEME, colors: { ...INDIGO_THEME.colors, accent: "blue" } };
    expect(themeSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects radius outside the 0–22 slider range", () => {
    expect(themeSchema.safeParse({ ...INDIGO_THEME, radius: 30 }).success).toBe(false);
  });

  it("resolveTheme falls back to Indigo on invalid input", () => {
    expect(resolveTheme(null)).toEqual(INDIGO_THEME);
    expect(resolveTheme({ nope: true })).toEqual(INDIGO_THEME);
  });

  it("resolveTheme parses a valid DB-shaped theme", () => {
    expect(resolveTheme(INDIGO_THEME)).toEqual(INDIGO_THEME);
  });
});
