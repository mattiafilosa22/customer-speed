import { describe, expect, it } from "vitest";

import { AA_TEXT } from "@/lib/contrast";
import { allPillContrasts } from "@/lib/pill-contrast";
import { THEME_PRESETS, THEME_PRESET_ORDER } from "@/lib/theme-presets";
import { INDIGO_THEME } from "@/lib/theme";

/**
 * Regression guard for the a11y audit fix (docs/05 §5.6): every stage + tone
 * pill (soft tint background + darkened hue text) MUST clear WCAG AA text
 * contrast (≥4.5:1) in light mode. A future change to a stage hue, the soft
 * tint, or the ink-darken amount that drops a pill below AA fails here.
 */
describe("stage/tone pill contrast (WCAG AA)", () => {
  it("covers all 9 stages and 4 tones (13 pills)", () => {
    expect(allPillContrasts()).toHaveLength(13);
  });

  it("every default pill text/background pair clears text AA (≥4.5:1)", () => {
    for (const { key, ratio } of allPillContrasts()) {
      expect(ratio, `${key} (ratio ${ratio})`).toBeGreaterThanOrEqual(AA_TEXT);
    }
  });

  it("each of the 9 stage pills clears AA individually", () => {
    const stages = allPillContrasts(INDIGO_THEME).filter((p) => p.key.startsWith("stage:"));
    expect(stages).toHaveLength(9);
    for (const { key, ratio } of stages) {
      expect(ratio, key).toBeGreaterThanOrEqual(AA_TEXT);
    }
  });

  it("holds for every white-label preset (stage/tone hues are shared)", () => {
    for (const preset of THEME_PRESET_ORDER) {
      for (const { key, ratio } of allPillContrasts(THEME_PRESETS[preset])) {
        expect(ratio, `${preset} / ${key}`).toBeGreaterThanOrEqual(AA_TEXT);
      }
    }
  });
});
