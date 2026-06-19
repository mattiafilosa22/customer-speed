import type { Theme } from "@/lib/theme";

/**
 * Typography presets offered by the appearance panel (docs/05 §5.2/§5.4).
 *
 * The panel picks a font PAIR by id; each id maps to the concrete `Theme.fonts`
 * triple (display/body/mono). Keeping this mapping here (not in the component)
 * keeps the UI free of hard-coded font strings and lets the same data drive the
 * selector and the resolution of a stored theme back to its preset id.
 */
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

export const FONT_PAIRS: Readonly<Record<FontPairId, Theme["fonts"]>> = {
  "bebas-montserrat": { display: "Bebas Neue", body: "Montserrat", mono: MONO_STACK },
  inter: { display: "Inter", body: "Inter", mono: MONO_STACK },
  manrope: { display: "Manrope", body: "Manrope", mono: MONO_STACK },
  system: { display: SYSTEM_STACK, body: SYSTEM_STACK, mono: MONO_STACK },
};

/** Resolve a stored `Theme.fonts` back to its pair id (defaults to the brand pair). */
export function fontPairIdOf(fonts: Theme["fonts"]): FontPairId {
  for (const id of FONT_PAIR_IDS) {
    if (FONT_PAIRS[id].body === fonts.body && FONT_PAIRS[id].display === fonts.display) {
      return id;
    }
  }
  return "bebas-montserrat";
}
