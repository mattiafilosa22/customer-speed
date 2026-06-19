import { describe, expect, it } from "vitest";

import { contrastRatio, validateThemeContrast } from "@/lib/contrast";
import { themeSchema } from "@/lib/theme";
import { THEME_PRESETS, THEME_PRESET_ORDER, getPreset } from "@/lib/theme-presets";

describe("theme presets", () => {
  it("defines all seven presets (docs/05 §5.5)", () => {
    expect(THEME_PRESET_ORDER).toHaveLength(7);
    expect(THEME_PRESET_ORDER[0]).toBe("indigo");
  });

  it("every preset is a complete, schema-valid Theme", () => {
    for (const preset of THEME_PRESET_ORDER) {
      expect(() => themeSchema.parse(THEME_PRESETS[preset])).not.toThrow();
      expect(THEME_PRESETS[preset].preset).toBe(preset);
    }
  });

  it("every preset passes the critical WCAG AA pairs", () => {
    for (const preset of THEME_PRESET_ORDER) {
      const report = validateThemeContrast(THEME_PRESETS[preset]);
      expect(report.passes, `preset ${preset} must pass AA`).toBe(true);
    }
  });

  it("white-on-accent ≥ 4.5 and accent-on-bg ≥ 3 for every preset", () => {
    for (const preset of THEME_PRESET_ORDER) {
      const theme = THEME_PRESETS[preset];
      const whiteOnAccent = contrastRatio("#ffffff", theme.colors.accent);
      const accentOnBg = contrastRatio(theme.colors.accent, theme.colors.bg);
      expect(whiteOnAccent, `${preset} white-on-accent`).toBeGreaterThanOrEqual(4.5);
      expect(accentOnBg, `${preset} accent-on-bg`).toBeGreaterThanOrEqual(3);
    }
  });

  it("getPreset returns the matching theme", () => {
    expect(getPreset("teal").colors.accent).toBe(THEME_PRESETS.teal.colors.accent);
  });
});
