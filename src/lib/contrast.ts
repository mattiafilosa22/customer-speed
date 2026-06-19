import type { Theme } from "@/lib/theme";

/**
 * WCAG 2.1 contrast utilities (docs/05 §5.6).
 *
 * Pure, dependency-free math: relative luminance + contrast ratio per the WCAG
 * definition, plus theme-level validation used by the appearance panel and the
 * server use case. No business logic, no I/O — fully unit-testable with known
 * pairs (white/black = 21:1, white/white = 1:1).
 *
 * Thresholds (WCAG 2.1 AA):
 *   - normal text:                4.5:1
 *   - large text / UI components: 3:1
 */

/** AA contrast threshold for normal-size text. */
export const AA_TEXT = 4.5;
/** AA contrast threshold for large text and non-text UI components. */
export const AA_LARGE = 3;

/** Parse a 6-digit hex color (`#rrggbb`) to its 0–255 RGB channels. */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const match = /^#([0-9a-fA-F]{6})$/u.exec(hex.trim());
  if (!match?.[1]) {
    throw new Error(`Invalid hex color: ${hex}`);
  }
  const int = Number.parseInt(match[1], 16);
  return {
    r: (int >> 16) & 0xff,
    g: (int >> 8) & 0xff,
    b: int & 0xff,
  };
}

/** Linearize one sRGB channel (0–255) per the WCAG relative-luminance formula. */
function linearizeChannel(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/**
 * Relative luminance of an sRGB color, in [0, 1] (WCAG 2.1 definition).
 * Black → 0, white → 1.
 */
export function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  return (
    0.2126 * linearizeChannel(r) +
    0.7152 * linearizeChannel(g) +
    0.0722 * linearizeChannel(b)
  );
}

/**
 * Contrast ratio between two colors, in [1, 21] (WCAG 2.1).
 * Symmetric; order of arguments does not matter.
 */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Does the pair meet AA for normal text (≥ 4.5:1)? */
export function meetsTextAA(foreground: string, background: string): boolean {
  return contrastRatio(foreground, background) >= AA_TEXT;
}

/** Does the pair meet AA for large text / UI components (≥ 3:1)? */
export function meetsLargeAA(foreground: string, background: string): boolean {
  return contrastRatio(foreground, background) >= AA_LARGE;
}

/** Severity of a contrast finding: `error` blocks save, `warning` does not. */
export type ContrastSeverity = "error" | "warning";

/** One contrast issue against a theme color pair. */
export interface ContrastIssue {
  /** Stable key for i18n / tests (e.g. "ink-on-panel"). */
  readonly pair: string;
  readonly foreground: string;
  readonly background: string;
  readonly ratio: number;
  readonly required: number;
  readonly severity: ContrastSeverity;
}

export interface ThemeContrastReport {
  /** True when there is no `error`-severity issue (i.e. the theme is saveable). */
  readonly passes: boolean;
  readonly issues: readonly ContrastIssue[];
}

/** Round a ratio to two decimals for stable reporting/tests. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * The contrast pairs we validate on a theme. CRITICAL pairs (`error`) gate save
 * because they carry the readable content; advisory pairs (`warning`) surface a
 * caution but never block.
 *
 *  - ink-on-panel / ink-on-bg : primary text on surfaces  → text AA (error)
 *  - white-on-accent          : button label on primary   → text AA (error)
 *  - accent-on-bg             : focus ring / accent UI     → large/UI AA (error)
 *  - muted-on-panel           : secondary text            → text AA (warning;
 *      docs/05 §5.6 documents --muted ≈ 3.5:1 → "large/secondary text only")
 */
const PAIRS: ReadonlyArray<{
  pair: string;
  fg: (c: Theme["colors"]) => string;
  bg: (c: Theme["colors"]) => string;
  required: number;
  severity: ContrastSeverity;
}> = [
  { pair: "ink-on-panel", fg: (c) => c.ink, bg: (c) => c.panel, required: AA_TEXT, severity: "error" },
  { pair: "ink-on-bg", fg: (c) => c.ink, bg: (c) => c.bg, required: AA_TEXT, severity: "error" },
  { pair: "white-on-accent", fg: () => "#ffffff", bg: (c) => c.accent, required: AA_TEXT, severity: "error" },
  { pair: "accent-on-bg", fg: (c) => c.accent, bg: (c) => c.bg, required: AA_LARGE, severity: "error" },
  { pair: "muted-on-panel", fg: (c) => c.muted, bg: (c) => c.panel, required: AA_TEXT, severity: "warning" },
];

/**
 * Validate a Theme's color pairs against WCAG AA. Returns every issue (so the UI
 * can show all cautions at once) and a `passes` flag that is true unless a
 * CRITICAL pair fails — the server uses `passes` to block a save, while the live
 * preview shows warnings inline regardless.
 */
export function validateThemeContrast(theme: Theme): ThemeContrastReport {
  const issues: ContrastIssue[] = [];
  for (const def of PAIRS) {
    const foreground = def.fg(theme.colors);
    const background = def.bg(theme.colors);
    const ratio = contrastRatio(foreground, background);
    if (ratio < def.required) {
      issues.push({
        pair: def.pair,
        foreground,
        background,
        ratio: round2(ratio),
        required: def.required,
        severity: def.severity,
      });
    }
  }
  return {
    passes: !issues.some((i) => i.severity === "error"),
    issues,
  };
}
