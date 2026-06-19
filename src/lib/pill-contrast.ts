import { contrastRatio, mixSrgb } from "@/lib/contrast";
import { INDIGO_THEME, type Theme } from "@/lib/theme";

/**
 * Pill contrast recipe (docs/05 §5.3 / §5.6).
 *
 * Stage and semantic-tone pills render a SOFT tint of the hue as background and
 * the SAME hue as text. The full hue on the tint is only ~2.4–3.8:1 on light
 * surfaces (fails AA for the small mono label), so the text is darkened toward
 * black. These two constants are the single source of truth for that recipe:
 *   - the Pill component applies them via CSS `color-mix` (tint = --panel mix,
 *     darken = the `--pill-ink-darken` token), so theming/tenant recolor work;
 *   - this module replicates the SAME math with `mixSrgb` so a unit test can
 *     assert every pill pair clears AA and a future regression fails fast.
 *
 * Keep these in sync with tokens.css (`--pill-ink-darken`) and the 12% tint in
 * src/components/ui/pill.tsx.
 */
export const PILL_SOFT_TINT_PCT = 12;
/** Light-mode darkening: 45% black mix = 55% of the hue (matches tokens.css). */
export const PILL_INK_DARKEN_PCT = 45;

/** The pill pairs to validate: 9 stages + 4 semantic tones. */
const PILL_HUES = (theme: Theme): ReadonlyArray<{ key: string; hue: string }> => [
  ...Object.entries(theme.stageColors).map(([key, hue]) => ({ key: `stage:${key}`, hue })),
  { key: "tone:ok", hue: theme.colors.ok },
  { key: "tone:warn", hue: theme.colors.warn },
  { key: "tone:doc", hue: theme.colors.doc },
  { key: "tone:exec", hue: theme.colors.exec },
];

/** A computed pill contrast result for one hue. */
export interface PillContrast {
  readonly key: string;
  readonly bg: string;
  readonly ink: string;
  readonly ratio: number;
}

/**
 * Computes the rendered (light-mode) pill background and darkened ink for a hue,
 * mixing against the theme's `panel`, then the resulting AA contrast ratio.
 */
export function pillContrast(hue: string, panel: string): { bg: string; ink: string; ratio: number } {
  const bg = mixSrgb(hue, panel, PILL_SOFT_TINT_PCT);
  const ink = mixSrgb(hue, "#000000", 100 - PILL_INK_DARKEN_PCT);
  return { bg, ink, ratio: Math.round(contrastRatio(ink, bg) * 100) / 100 };
}

/** Light-mode pill contrast for every stage + tone of a theme (default Indigo). */
export function allPillContrasts(theme: Theme = INDIGO_THEME): readonly PillContrast[] {
  return PILL_HUES(theme).map(({ key, hue }) => ({ key, ...pillContrast(hue, theme.colors.panel) }));
}
