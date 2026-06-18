import { ValidationError } from "@/lib/errors";
import type { PrismaClient } from "@/generated/prisma/client";

/**
 * Resolve an Organization id from a public `slug` (single-domain model).
 *
 * UX/tenant decision (docs/06 §6.1, docs/08): one app domain serves one tenant
 * at a time today. The auth use cases require an `organizationId` (email is
 * unique PER tenant, never globally — `@@unique([organizationId, email])`), so
 * the boundary must map the human-facing tenant identifier (a slug) to its id
 * BEFORE delegating to the use cases.
 *
 * - For Fase 1 the slug defaults to `env.DEFAULT_ORG_SLUG` ("fabio"), so the
 *   forms work against the seeded proUser tenant without extra input.
 * - This is the single seam to extend for subdomain / custom-domain routing:
 *   derive the slug from the request host and pass it here. No call site or the
 *   `@@unique` constraint changes.
 *
 * Returns a typed `ValidationError` (→ 400) on an unknown slug so the boundary
 * surfaces a generic, non-revealing message (it does NOT leak which tenants
 * exist beyond the slug the caller already supplied).
 *
 * The Prisma surface is the BASE client: this lookup is intentionally NOT
 * tenant-scoped — it is the step that establishes which tenant we are in.
 */
type OrgResolveClient = Pick<PrismaClient, "organization">;

export async function resolveOrganizationIdBySlug(
  prisma: OrgResolveClient,
  slug: string,
): Promise<string> {
  const normalized = slug.trim().toLowerCase();
  if (normalized.length === 0) {
    throw new ValidationError({ organizationSlug: ["Organization is required"] });
  }

  const org = await prisma.organization.findUnique({
    where: { slug: normalized },
    select: { id: true },
  });

  if (!org) {
    throw new ValidationError({ organizationSlug: ["Unknown organization"] });
  }

  return org.id;
}
