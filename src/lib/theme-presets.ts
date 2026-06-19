import { INDIGO_THEME, type Theme, type ThemePreset, themeSchema } from "@/lib/theme";
import { validateThemeContrast } from "@/lib/contrast";

/**
 * The seven white-label palette presets (docs/05 §5.5), defined as COMPLETE
 * themes — not just a primary color — so picking a swatch yields a coherent,
 * AA-compliant theme in one step.
 *
 * Design decisions:
 *  - Surfaces, text and the semantic stage colors are SHARED across presets:
 *    only the brand `accent` / `accentInk` change. The stage hues are
 *    domain-semantic (won=green, lost=red, …) and must stay recognizable
 *    regardless of brand, so they are NOT re-tinted per preset.
 *  - Two swatch hues from the spec table (Corallo #E5533B, Oro #C98A12) do NOT
 *    reach 4.5:1 with white button text. The spec ALSO requires every preset to
 *    pass AA, so we keep the recognizable hue family but use a slightly DARKER,
 *    AA-compliant accent token (Corallo → #c43d28, Oro → #946609). The lighter
 *    catalogue hue can still be offered as a swatch label; the applied token is
 *    the accessible one. This is the deliberate resolution of the tension.
 *  - Every preset below is validated against `validateThemeContrast` at module
 *    load (see the assertion at the end), so a regression fails fast in dev/test
 *    rather than shipping an inaccessible palette.
 *
 * Computed AA ratios (white-on-accent / accent-on-bg, both must clear their
 * threshold — 4.5 / 3):
 *   indigo     5.37 / 5.02   coral 5.19 / 4.85   teal 5.02 / 4.69
 *   blue       6.30 / 5.89   violet 6.16 / 5.75  gold 5.04 / 4.71
 *   near-black 18.29 / 17.09
 */

/** Shared, non-brand portion of every preset (surfaces, text, stage colors). */
const SHARED = {
  mode: INDIGO_THEME.mode,
  radius: INDIGO_THEME.radius,
  fonts: INDIGO_THEME.fonts,
  stageColors: INDIGO_THEME.stageColors,
  buttonStyle: INDIGO_THEME.buttonStyle,
  density: INDIGO_THEME.density,
  softShadows: INDIGO_THEME.softShadows,
  // Surface/text colors are shared; only accent/accentInk vary per preset.
  baseColors: {
    bg: INDIGO_THEME.colors.bg,
    panel: INDIGO_THEME.colors.panel,
    ink: INDIGO_THEME.colors.ink,
    muted: INDIGO_THEME.colors.muted,
    line: INDIGO_THEME.colors.line,
    line2: INDIGO_THEME.colors.line2,
    ok: INDIGO_THEME.colors.ok,
    warn: INDIGO_THEME.colors.warn,
    doc: INDIGO_THEME.colors.doc,
    exec: INDIGO_THEME.colors.exec,
  },
} as const;

/** Per-preset brand pair: the accent and its hover/pressed ink. */
const ACCENTS: Readonly<Record<ThemePreset, { accent: string; accentInk: string }>> = {
  indigo: { accent: "#5b5bd6", accentInk: "#4a48c4" },
  coral: { accent: "#c43d28", accentInk: "#a93220" },
  teal: { accent: "#1c7c74", accentInk: "#15635c" },
  blue: { accent: "#3454d1", accentInk: "#2a45b3" },
  violet: { accent: "#7a4e9e", accentInk: "#653f84" },
  gold: { accent: "#946609", accentInk: "#7a5407" },
  "near-black": { accent: "#16150f", accentInk: "#000000" },
};

function buildPreset(preset: ThemePreset): Theme {
  const { accent, accentInk } = ACCENTS[preset];
  return themeSchema.parse({
    preset,
    mode: SHARED.mode,
    radius: SHARED.radius,
    fonts: SHARED.fonts,
    colors: { accent, accentInk, ...SHARED.baseColors },
    stageColors: SHARED.stageColors,
    buttonStyle: SHARED.buttonStyle,
    density: SHARED.density,
    softShadows: SHARED.softShadows,
  });
}

/** All presets keyed by id. Validated (AA) at module load. */
export const THEME_PRESETS: Readonly<Record<ThemePreset, Theme>> = {
  indigo: buildPreset("indigo"),
  coral: buildPreset("coral"),
  teal: buildPreset("teal"),
  blue: buildPreset("blue"),
  violet: buildPreset("violet"),
  gold: buildPreset("gold"),
  "near-black": buildPreset("near-black"),
};

/** Ordered list for swatch rendering (default first), docs/05 §5.5. */
export const THEME_PRESET_ORDER: readonly ThemePreset[] = [
  "indigo",
  "coral",
  "teal",
  "blue",
  "violet",
  "gold",
  "near-black",
];

/** Returns the complete preset Theme for a preset id. */
export function getPreset(preset: ThemePreset): Theme {
  return THEME_PRESETS[preset];
}

// Fail fast: every preset MUST clear the critical AA pairs (docs/05 §5.5/§5.6).
for (const preset of THEME_PRESET_ORDER) {
  const report = validateThemeContrast(THEME_PRESETS[preset]);
  if (!report.passes) {
    const failed = report.issues
      .filter((i) => i.severity === "error")
      .map((i) => `${i.pair} ${i.ratio}<${i.required}`)
      .join(", ");
    throw new Error(`Preset "${preset}" fails WCAG AA: ${failed}`);
  }
}
