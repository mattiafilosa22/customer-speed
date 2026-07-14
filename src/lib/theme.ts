import { z } from "zod";

/**
 * Theme — the typed, validated shape of `Organization.theme` (JSON).
 *
 * This is the single source of truth for the white-label theme contract. It is
 * intentionally aligned 1:1 with the object the seed writes to
 * `Organization.theme` (see prisma/seed.ts → INDIGO_THEME) so a row read from
 * the DB parses cleanly. `themeToCssVars()` turns a Theme into the CSS custom
 * properties consumed by tokens.css / globals.css; the server injects them on
 * <html> (see src/app/(app)/layout.tsx) for per-tenant theming with no FOUC.
 *
 * No business logic lives here — only the schema, the default preset, and the
 * pure mapping Theme → CSS variables.
 */

/** 6-digit hex color (e.g. `#5b5bd6`). */
const hexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/u, "Expected a 6-digit hex color like #5b5bd6");

export const themeModeSchema = z.enum(["light", "dark", "auto"]);
export type ThemeMode = z.infer<typeof themeModeSchema>;

/** Button shape (docs/05 §5.4): "filled" = themed radius, "squared" = radius 0. */
export const buttonStyleSchema = z.enum(["filled", "squared"]);
export type ButtonStyle = z.infer<typeof buttonStyleSchema>;

/** Interface density (docs/05 §5.4): scales spacing. */
export const densitySchema = z.enum(["comfortable", "compact"]);
export type Density = z.infer<typeof densitySchema>;

export const themePresetSchema = z.enum([
  "indigo",
  "coral",
  "teal",
  "blue",
  "violet",
  "gold",
  "near-black",
]);
export type ThemePreset = z.infer<typeof themePresetSchema>;

const themeFontsSchema = z.object({
  display: z.string().min(1),
  body: z.string().min(1),
  mono: z.string().min(1),
});

const themeColorsSchema = z.object({
  accent: hexColor,
  accentInk: hexColor,
  bg: hexColor,
  panel: hexColor,
  ink: hexColor,
  muted: hexColor,
  line: hexColor,
  line2: hexColor,
  ok: hexColor,
  warn: hexColor,
  doc: hexColor,
  exec: hexColor,
});

/** Stage color keys mirror the `LeadStage` enum values (string-keyed JSON). */
const themeStageColorsSchema = z.object({
  TO_HANDLE: hexColor,
  TAKEN: hexColor,
  CALL_SCHEDULED: hexColor,
  WAITING_DOCS: hexColor,
  PRESENTATION_CALL: hexColor,
  PRESENTATION_CALL_2: hexColor,
  WAITING_DECISION: hexColor,
  STANDBY: hexColor,
  WAITING_PAYMENT: hexColor,
  WON: hexColor,
  LOST: hexColor,
});

export const themeSchema = z.object({
  preset: themePresetSchema,
  mode: themeModeSchema,
  /** Base radius in px — slider range 0–22 (docs/05 §5.4). */
  radius: z.number().int().min(0).max(22),
  fonts: themeFontsSchema,
  colors: themeColorsSchema,
  stageColors: themeStageColorsSchema,
  /**
   * Component-style options (docs/05 §5.4). Added in Fase 7. They are OPTIONAL
   * with defaults so theme JSON written before Fase 7 (e.g. the original seed,
   * which had none of these) still parses cleanly — backward compatible.
   */
  buttonStyle: buttonStyleSchema.default("filled"),
  density: densitySchema.default("comfortable"),
  /** Soft shadows on/off (docs/05 §5.4). */
  softShadows: z.boolean().default(true),
});

export type Theme = z.infer<typeof themeSchema>;
export type ThemeColors = z.infer<typeof themeColorsSchema>;
export type ThemeStageColors = z.infer<typeof themeStageColorsSchema>;

/**
 * Indigo preset — the default, complete theme (docs/05 §5.3 / §5.5).
 *
 * Mirrors prisma/seed.ts INDIGO_THEME exactly so DB and runtime defaults never
 * diverge. Validated at module load so a typo fails fast in dev/test.
 */
export const INDIGO_THEME: Theme = themeSchema.parse({
  preset: "indigo",
  mode: "light",
  radius: 12,
  fonts: {
    display: "Bebas Neue",
    body: "Montserrat",
    mono: "IBM Plex Mono",
  },
  colors: {
    accent: "#5b5bd6",
    accentInk: "#4a48c4",
    bg: "#f7f7f9",
    panel: "#ffffff",
    ink: "#1c1c22",
    muted: "#6e6e79",
    line: "#ececef",
    line2: "#f3f3f5",
    ok: "#16a34a",
    warn: "#d97706",
    doc: "#0d9488",
    exec: "#db2777",
  },
  stageColors: {
    TO_HANDLE: "#8c8c97",
    TAKEN: "#5b5bd6",
    CALL_SCHEDULED: "#0ea5e9",
    WAITING_DOCS: "#d97706",
    PRESENTATION_CALL: "#7a4e9e",
    PRESENTATION_CALL_2: "#ca8a04",
    WAITING_DECISION: "#db2777",
    STANDBY: "#78716c",
    WAITING_PAYMENT: "#0d9488",
    WON: "#16a34a",
    LOST: "#e5533b",
  },
  buttonStyle: "filled",
  density: "comfortable",
  softShadows: true,
});

/**
 * Pure mapping: Theme → CSS custom properties.
 *
 * Emits ONLY the tokens that vary per tenant AND are mode-independent: the brand
 * accent (+ its hover ink) and the base radius. Everything else — neutral
 * surfaces (bg/panel/ink/muted/line), semantic status colors, stage hues and all
 * derived tokens (soft fills, ink variants, shadows) — is owned by tokens.css so
 * it can switch between light (`:root`) and dark (`[data-theme="dark"]`). Those
 * values are identical across all presets (only the accent differs), so nothing
 * is lost by not injecting them — and crucially it lets dark mode actually take
 * effect instead of being overridden by inline light surfaces. `--accent-soft`
 * stays in tokens.css too: it is derived from `var(--accent)` (which we DO emit)
 * with a mode-specific mix target, so it recolors per tenant AND adapts to mode.
 *
 * Font families come from next/font (emitted as --f-* on :root by the layout),
 * not from here.
 */
export function themeToCssVars(theme: Theme): Readonly<Record<string, string>> {
  const vars: Record<string, string> = {
    "--accent": theme.colors.accent,
    "--accent-ink": theme.colors.accentInk,
    "--radius": `${theme.radius}px`,
  };

  // Soft shadows off → neutralize the shadow tokens (kept theme-driven; the
  // utilities still reference --sh / --sh-sm, they just resolve to `none`).
  if (!theme.softShadows) {
    vars["--sh-sm"] = "none";
    vars["--sh"] = "none";
  }

  return vars;
}

/** Concrete (non-"auto") light/dark mode. */
export type ResolvedMode = "light" | "dark";

/**
 * Cookie holding the user's light/dark override. Defined here (a server-safe
 * module) — NOT in the "use client" toggle — because a constant exported from a
 * client module becomes a client reference when imported by a Server Component,
 * so the server layout would read the wrong key. Both the toggle (client) and
 * the layout (server) import it from here.
 */
export const THEME_MODE_COOKIE = "cs-theme-mode";

/**
 * Resolves a theme's stored `mode` to a concrete light/dark value for SSR.
 * "auto" resolves to light on the server (the OS preference is refined
 * client-side by the mode toggle). An explicit user override (e.g. from the
 * `cs-theme-mode` cookie) takes precedence over the tenant default.
 */
export function resolveMode(
  theme: Pick<Theme, "mode">,
  override?: ResolvedMode | null,
): ResolvedMode {
  if (override === "light" || override === "dark") return override;
  return theme.mode === "dark" ? "dark" : "light";
}

/**
 * Non-color theme switches surfaced as `data-*` attributes on the theming
 * wrapper. tokens.css keys the light/dark palette, density spacing and button
 * radius off these, so the mapping stays declarative (no per-component
 * conditionals, no hard-coded style). Pure function — single source of truth for
 * the attribute contract. `mode` overrides the theme's stored mode (used to
 * apply the user's light/dark toggle choice).
 */
export function themeDataAttributes(
  theme: Theme,
  mode?: ResolvedMode,
): Readonly<Record<`data-${string}`, string>> {
  return {
    "data-theme": mode ?? resolveMode(theme),
    "data-button-style": theme.buttonStyle,
    "data-density": theme.density,
  };
}

/**
 * Parses an unknown JSON value (e.g. `Organization.theme` from Prisma) into a
 * validated Theme, falling back to the Indigo default when absent/invalid. The
 * fallback keeps the UI rendering rather than crashing on a malformed row; in
 * Fase 1 the tenant context supplies the real org theme.
 */
export function resolveTheme(raw: unknown): Theme {
  const parsed = themeSchema.safeParse(raw);
  return parsed.success ? parsed.data : INDIGO_THEME;
}
