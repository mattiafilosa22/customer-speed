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
  WAITING_DECISION: hexColor,
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
    muted: "#8c8c97",
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
    WAITING_DECISION: "#db2777",
    WAITING_PAYMENT: "#0d9488",
    WON: "#16a34a",
    LOST: "#e5533b",
  },
});

/** Maps a stage color key to its CSS custom-property name (tokens.css). */
const STAGE_CSS_VAR: Readonly<Record<keyof ThemeStageColors, string>> = {
  TO_HANDLE: "--stage-to-handle",
  TAKEN: "--stage-taken",
  CALL_SCHEDULED: "--stage-call-scheduled",
  WAITING_DOCS: "--stage-waiting-docs",
  PRESENTATION_CALL: "--stage-presentation",
  WAITING_DECISION: "--stage-waiting-decision",
  WAITING_PAYMENT: "--stage-waiting-payment",
  WON: "--stage-won",
  LOST: "--stage-lost",
};

/**
 * Pure mapping: Theme → CSS custom properties.
 *
 * Returns a flat record of `--token: value` pairs. Only values that vary per
 * tenant are emitted (colors, stage colors, radius, fonts); derived tokens
 * (soft fills via color-mix, radius variants, shadows) stay in tokens.css and
 * recompute automatically from these. Font families are emitted as the bare
 * runtime --f-* vars; when next/font is in play, the layout passes its
 * generated families instead (see note in layout).
 */
export function themeToCssVars(theme: Theme): Readonly<Record<string, string>> {
  const vars: Record<string, string> = {
    "--accent": theme.colors.accent,
    "--accent-ink": theme.colors.accentInk,
    "--bg": theme.colors.bg,
    "--panel": theme.colors.panel,
    "--ink": theme.colors.ink,
    "--muted": theme.colors.muted,
    "--line": theme.colors.line,
    "--line2": theme.colors.line2,
    "--ok": theme.colors.ok,
    "--warn": theme.colors.warn,
    "--doc": theme.colors.doc,
    "--exec": theme.colors.exec,
    "--radius": `${theme.radius}px`,
  };

  for (const [key, cssVar] of Object.entries(STAGE_CSS_VAR)) {
    vars[cssVar] = theme.stageColors[key as keyof ThemeStageColors];
  }

  return vars;
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
