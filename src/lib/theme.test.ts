import { describe, expect, it } from "vitest";

import {
  INDIGO_THEME,
  resolveMode,
  resolveTheme,
  themeDataAttributes,
  themeSchema,
  themeToCssVars,
} from "@/lib/theme";

describe("theme", () => {
  it("Indigo preset is a valid, complete theme", () => {
    expect(themeSchema.safeParse(INDIGO_THEME).success).toBe(true);
    expect(INDIGO_THEME.preset).toBe("indigo");
    expect(INDIGO_THEME.mode).toBe("light");
    expect(INDIGO_THEME.radius).toBe(12);
  });

  it("themeToCssVars emits only the per-tenant, mode-independent tokens", () => {
    const vars = themeToCssVars(INDIGO_THEME);
    expect(vars["--accent"]).toBe("#5b5bd6");
    expect(vars["--accent-ink"]).toBe("#4a48c4");
    expect(vars["--radius"]).toBe("12px");
    // Neutral surfaces and stage hues are mode-owned in tokens.css (so dark mode
    // takes effect instead of being overridden by inline light surfaces).
    expect(vars["--bg"]).toBeUndefined();
    expect(vars["--panel"]).toBeUndefined();
    expect(vars["--ink"]).toBeUndefined();
    expect(vars["--stage-taken"]).toBeUndefined();
  });

  it("themeToCssVars neutralizes shadows when softShadows is off", () => {
    expect(themeToCssVars(INDIGO_THEME)["--sh"]).toBeUndefined();
    const flat = themeToCssVars({ ...INDIGO_THEME, softShadows: false });
    expect(flat["--sh"]).toBe("none");
    expect(flat["--sh-sm"]).toBe("none");
  });

  it("resolveMode: user override wins over the stored theme mode", () => {
    expect(resolveMode({ mode: "light" })).toBe("light");
    expect(resolveMode({ mode: "dark" })).toBe("dark");
    expect(resolveMode({ mode: "auto" })).toBe("light"); // auto → light on the server
    expect(resolveMode({ mode: "light" }, "dark")).toBe("dark");
    expect(resolveMode({ mode: "dark" }, "light")).toBe("light");
    expect(resolveMode({ mode: "dark" }, null)).toBe("dark");
  });

  it("themeDataAttributes applies the mode override to data-theme", () => {
    expect(themeDataAttributes(INDIGO_THEME)["data-theme"]).toBe("light");
    expect(themeDataAttributes(INDIGO_THEME, "dark")["data-theme"]).toBe("dark");
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
