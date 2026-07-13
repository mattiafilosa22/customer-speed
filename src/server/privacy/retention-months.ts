import type { PrivacyDeps } from "@/server/privacy/deps";

/**
 * Resolves the retention window (in months) to use for a bulk retention
 * operation (settings-screen count preview, bulk export): an explicit
 * caller-supplied value wins (already Zod-validated at the Server Action
 * boundary — positive integer, docs/00 §2), otherwise falls back to the
 * tenant's configured `Organization.leadRetentionMonths`.
 *
 * Returns `null` when neither is available — the caller MUST treat that as
 * "retention disabled for this tenant" (zero candidates), never as an error:
 * a tenant is not required to configure a retention window.
 *
 * `Organization` is the tenant ROOT, not a tenant-scoped domain model (see
 * `src/server/organization/deps.ts`), so it is NOT auto-scoped by the Prisma
 * Client extension — this reads `where: { id: actor.organizationId }`
 * explicitly (the id comes from the SERVER context, never client input).
 */
export async function resolveRetentionMonths(
  deps: PrivacyDeps,
  explicitMonths?: number,
): Promise<number | null> {
  if (explicitMonths !== undefined) {
    return explicitMonths;
  }

  const org = await deps.prisma.organization.findUnique({
    where: { id: deps.actor.organizationId },
    select: { leadRetentionMonths: true },
  });

  return org?.leadRetentionMonths ?? null;
}
