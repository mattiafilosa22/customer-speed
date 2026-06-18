import { z } from "zod";

/**
 * Per-tenant feature flags (`Organization.featureFlags` JSON).
 *
 * Flags toggle whole modules per tenant (docs/01, docs/08). For Fabio every
 * module is on EXCEPT calendar integrations:
 *   { leads:true, pipeline:true, dashboard:true, appointments:true,
 *     invoices:true, calendarIntegrations:false }.
 *
 * The JSON is untrusted at the type level (it is a `Json` column), so we parse it
 * with Zod and apply safe defaults. Unknown keys are ignored; missing keys
 * default to the value below. Defaults are permissive for the core modules and
 * RESTRICTIVE for the optional/integration module (`calendarIntegrations`), so a
 * misconfigured/empty tenant never accidentally exposes an unbuilt integration.
 */
export const featureFlagsSchema = z
  .object({
    leads: z.boolean().default(true),
    pipeline: z.boolean().default(true),
    dashboard: z.boolean().default(true),
    appointments: z.boolean().default(true),
    invoices: z.boolean().default(true),
    calendarIntegrations: z.boolean().default(false),
  })
  .partial()
  .transform((flags) => ({
    leads: flags.leads ?? true,
    pipeline: flags.pipeline ?? true,
    dashboard: flags.dashboard ?? true,
    appointments: flags.appointments ?? true,
    invoices: flags.invoices ?? true,
    calendarIntegrations: flags.calendarIntegrations ?? false,
  }));

export type FeatureFlags = z.infer<typeof featureFlagsSchema>;

export type FeatureFlagKey = keyof FeatureFlags;

/**
 * Parse an unknown JSON value (e.g. `Organization.featureFlags` from Prisma) into
 * the typed, fully-defaulted flag set. A malformed value falls back to defaults
 * (never throws) so the app shell always renders.
 */
export function parseFeatureFlags(value: unknown): FeatureFlags {
  const result = featureFlagsSchema.safeParse(value ?? {});
  return result.success ? result.data : featureFlagsSchema.parse({});
}
