/**
 * Typography presets offered by the appearance panel (docs/05 §5.2/§5.4).
 *
 * The panel picks a font PAIR by id; each id maps to the concrete `Theme.fonts`
 * triple (display/body/mono). Keeping this mapping here (not in the component)
 * keeps the UI free of hard-coded font strings and lets the same data drive the
 * selector and the resolution of a stored theme back to its preset id.
 *
 * The triple is typed STRUCTURALLY (`FontTriple`) rather than as `Theme["fonts"]`
 * so this module has no import cycle with `@/lib/theme`, which consumes
 * `fontFamilyStack()` to emit the --f-* custom properties.
 */

/** display/body/mono family names — structurally identical to `Theme["fonts"]`. */
export interface FontTriple {
  readonly display: string;
  readonly body: string;
  readonly mono: string;
}
export const FONT_PAIR_IDS = [
  "bebas-montserrat",
  "inter",
  "manrope",
  "system",
] as const;

export type FontPairId = (typeof FONT_PAIR_IDS)[number];

const SYSTEM_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
const MONO_STACK = "IBM Plex Mono";

export const FONT_PAIRS: Readonly<Record<FontPairId, FontTriple>> = {
  "bebas-montserrat": { display: "Bebas Neue", body: "Montserrat", mono: MONO_STACK },
  inter: { display: "Inter", body: "Inter", mono: MONO_STACK },
  manrope: { display: "Manrope", body: "Manrope", mono: MONO_STACK },
  system: { display: SYSTEM_STACK, body: SYSTEM_STACK, mono: MONO_STACK },
};

/**
 * Self-hosted families → the CSS variable `next/font` emits for them
 * (src/app/[locale]/layout.tsx). A family listed here is loaded by next/font, so
 * the theme must reference it through its variable (the actual family name is
 * hashed by next/font and is NOT usable directly). Families NOT listed — the
 * system stack — are already valid CSS font-family values and pass through.
 */
const FONT_VAR_BY_FAMILY: Readonly<Record<string, string>> = {
  "Bebas Neue": "--f-bebas",
  Montserrat: "--f-montserrat",
  Inter: "--f-inter",
  Manrope: "--f-manrope",
  "IBM Plex Mono": "--f-plex-mono",
};

/** Generic fallback appended to a self-hosted family, per role. */
const FALLBACK = {
  mono: "ui-monospace, monospace",
  sans: SYSTEM_STACK,
} as const;

/**
 * Resolve a stored family name to a complete, usable CSS `font-family` stack.
 * Self-hosted families resolve to their next/font variable + a generic fallback;
 * anything else (the system stack) is returned as-is.
 */
export function fontFamilyStack(family: string, role: "display" | "body" | "mono"): string {
  const variable = FONT_VAR_BY_FAMILY[family];
  if (!variable) return family;
  return `var(${variable}), ${role === "mono" ? FALLBACK.mono : FALLBACK.sans}`;
}

/**
 * The --f-* custom properties for a font triple. Consumed by `themeToCssVars`
 * (and therefore by both the real ThemeProvider and the live preview), so a font
 * change in the appearance panel actually takes effect at runtime.
 */
export function fontCssVars(fonts: FontTriple): Readonly<Record<string, string>> {
  return {
    "--f-display": fontFamilyStack(fonts.display, "display"),
    "--f-body": fontFamilyStack(fonts.body, "body"),
    "--f-mono": fontFamilyStack(fonts.mono, "mono"),
  };
}

/** Resolve a stored `Theme.fonts` back to its pair id (defaults to the brand pair). */
export function fontPairIdOf(fonts: FontTriple): FontPairId {
  for (const id of FONT_PAIR_IDS) {
    if (FONT_PAIRS[id].body === fonts.body && FONT_PAIRS[id].display === fonts.display) {
      return id;
    }
  }
  return "bebas-montserrat";
}
