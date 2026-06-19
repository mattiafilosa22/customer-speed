import { describe, expect, it } from "vitest";

import {
  AA_LARGE,
  AA_TEXT,
  contrastRatio,
  meetsLargeAA,
  meetsTextAA,
  mixSrgb,
  relativeLuminance,
  validateThemeContrast,
} from "@/lib/contrast";
import { INDIGO_THEME, type Theme } from "@/lib/theme";

describe("relativeLuminance", () => {
  it("returns 0 for black and 1 for white", () => {
    expect(relativeLuminance("#000000")).toBeCloseTo(0, 5);
    expect(relativeLuminance("#ffffff")).toBeCloseTo(1, 5);
  });

  it("throws on an invalid hex", () => {
    expect(() => relativeLuminance("nope")).toThrow();
  });
});

describe("contrastRatio (known pairs)", () => {
  it("white on black is 21:1", () => {
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 1);
  });

  it("identical colors are 1:1", () => {
    expect(contrastRatio("#5b5bd6", "#5b5bd6")).toBeCloseTo(1, 5);
  });

  it("is symmetric (order does not matter)", () => {
    expect(contrastRatio("#1c1c22", "#ffffff")).toBeCloseTo(
      contrastRatio("#ffffff", "#1c1c22"),
      6,
    );
  });

  it("matches a documented mid pair (#777 on white ≈ 4.48)", () => {
    expect(contrastRatio("#777777", "#ffffff")).toBeCloseTo(4.48, 1);
  });
});

describe("mixSrgb (CSS color-mix in srgb)", () => {
  it("returns the first color at 100% and the second at 0%", () => {
    expect(mixSrgb("#123456", "#ffffff", 100)).toBe("#123456");
    expect(mixSrgb("#123456", "#ffffff", 0)).toBe("#ffffff");
  });

  it("a 50/50 mix of black and white is mid grey", () => {
    expect(mixSrgb("#000000", "#ffffff", 50)).toBe("#808080");
  });

  it("matches a known 12% indigo tint on white", () => {
    // color-mix(in srgb, #5b5bd6 12%, #fff) → #ebebfa
    expect(mixSrgb("#5b5bd6", "#ffffff", 12)).toBe("#ebebfa");
  });
});

describe("AA threshold helpers", () => {
  it("ink on white passes text AA", () => {
    expect(meetsTextAA("#1c1c22", "#ffffff")).toBe(true);
  });

  it("muted (#8c8c97) on white fails text AA but its ratio is ~3.3", () => {
    expect(meetsTextAA("#8c8c97", "#ffffff")).toBe(false);
    expect(contrastRatio("#8c8c97", "#ffffff")).toBeGreaterThan(3);
    expect(contrastRatio("#8c8c97", "#ffffff")).toBeLessThan(AA_TEXT);
  });

  it("a 3:1 pair passes large/UI AA but not text AA", () => {
    // #949494 on white ≈ 3.0
    expect(meetsLargeAA("#949494", "#ffffff")).toBe(true);
    expect(contrastRatio("#949494", "#ffffff")).toBeGreaterThanOrEqual(AA_LARGE);
  });
});

describe("validateThemeContrast", () => {
  it("passes for the Indigo default with NO issues (muted now AA on both surfaces)", () => {
    const report = validateThemeContrast(INDIGO_THEME);
    expect(report.passes).toBe(true);
    // After the a11y fix the default theme is fully clean — no warnings either.
    expect(report.issues).toEqual([]);
  });

  it("the default --muted clears text AA on BOTH panel and bg (regression guard)", () => {
    const { muted, panel, bg } = INDIGO_THEME.colors;
    expect(contrastRatio(muted, panel)).toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrastRatio(muted, bg)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it("flags an ERROR when --muted is too light for small text", () => {
    const bad: Theme = {
      ...INDIGO_THEME,
      colors: { ...INDIGO_THEME.colors, muted: "#8c8c97" }, // the old, failing value
    };
    const report = validateThemeContrast(bad);
    expect(report.passes).toBe(false);
    expect(
      report.issues.some((i) => i.pair === "muted-on-panel" && i.severity === "error"),
    ).toBe(true);
    expect(report.issues.some((i) => i.pair === "muted-on-bg" && i.severity === "error")).toBe(
      true,
    );
  });

  it("flags an ERROR (and blocks) when body text has too little contrast", () => {
    const bad: Theme = {
      ...INDIGO_THEME,
      colors: { ...INDIGO_THEME.colors, ink: "#cfcfcf" }, // light grey ink on white
    };
    const report = validateThemeContrast(bad);
    expect(report.passes).toBe(false);
    expect(report.issues.some((i) => i.pair === "ink-on-panel" && i.severity === "error")).toBe(
      true,
    );
  });

  it("flags an ERROR when white button text fails on a too-light accent", () => {
    const bad: Theme = {
      ...INDIGO_THEME,
      colors: { ...INDIGO_THEME.colors, accent: "#f1c40f" }, // bright yellow
    };
    const report = validateThemeContrast(bad);
    expect(report.passes).toBe(false);
    expect(report.issues.some((i) => i.pair === "white-on-accent")).toBe(true);
  });

  it("reports the numeric ratio rounded to two decimals", () => {
    const bad: Theme = {
      ...INDIGO_THEME,
      colors: { ...INDIGO_THEME.colors, muted: "#8c8c97" },
    };
    const report = validateThemeContrast(bad);
    const muted = report.issues.find((i) => i.pair === "muted-on-panel");
    expect(muted).toBeDefined();
    expect(Number.isFinite(muted?.ratio)).toBe(true);
    // two decimals → at most 2 fractional digits
    expect(String(muted?.ratio).split(".")[1]?.length ?? 0).toBeLessThanOrEqual(2);
  });
});
