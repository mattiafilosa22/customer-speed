import { z } from "zod";

import { themeSchema } from "@/lib/theme";

/**
 * Zod schemas for the white-label settings domain (docs/05 §5.4) — the single
 * source of truth for the input shapes at the Server Action boundary (docs/00
 * §2). Types are inferred, never hand-written.
 *
 * The Theme is validated with the EXISTING `themeSchema` (src/lib/theme.ts) so
 * the appearance panel and the data layer share one contract. Contrast (WCAG AA)
 * is a SEMANTIC rule over a valid theme, not a shape rule, so it is enforced in
 * the use case (`validateThemeContrast`), not here.
 */

/** A data URL for an uploaded image (PNG/SVG) OR a normal http(s) URL. */
const imageRef = z
  .string()
  .trim()
  .max(2_000_000, "Image is too large") // ~2MB data URL guard
  .refine(
    (v) =>
      v.startsWith("data:image/png;base64,") ||
      v.startsWith("data:image/svg+xml") ||
      v.startsWith("https://") ||
      v.startsWith("http://"),
    "Must be a PNG/SVG data URL or an http(s) URL",
  );

/** Theme update payload — the full validated theme object. */
export const updateThemeSchema = z.object({
  theme: themeSchema,
});
/** Caller-facing INPUT shape (before Zod defaults are applied). */
export type UpdateThemeInput = z.input<typeof updateThemeSchema>;

/**
 * Brand update payload. `appName` is required; the asset fields are optional and
 * nullable (null = clear the value). `markFallback` is the ≤3-char textual mark
 * used when no logo is set.
 */
export const updateBrandingSchema = z.object({
  appName: z.string().trim().min(1, "App name is required").max(60),
  logoUrl: imageRef.nullable().optional(),
  faviconUrl: imageRef.nullable().optional(),
  markFallback: z
    .string()
    .trim()
    .max(3, "Mark must be at most 3 characters")
    .nullable()
    .optional()
    .transform((v) => (v && v.length > 0 ? v.toUpperCase() : null)),
  poweredBy: z.boolean(),
});
/** Caller-facing INPUT shape (optional asset fields stay optional). */
export type UpdateBrandingInput = z.input<typeof updateBrandingSchema>;
