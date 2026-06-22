import { NotFoundError } from "@/lib/errors";
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
 * - For Fase 1 the slug defaults to `env.DEFAULT_ORG_SLUG` (the NEUTRAL platform
 *   tenant "customerspeed", where the superAdmin lives) when the form supplies
 *   none. Customer tenants (e.g. Fabio) are reached with an explicit slug
 *   (`/login?org=fabio`).
 * - This is the single seam to extend for subdomain / custom-domain routing:
 *   derive the slug from the request host and pass it here. No call site or the
 *   `@@unique` constraint changes.
 *
 * Throws a typed `NotFoundError` (→ 404) on an unknown/empty slug. The auth
 * actions map this to a FORM-LEVEL generic message (non-revealing — it does NOT
 * leak which tenants exist). A `ValidationError` would be WRONG here: the slug is
 * derived from the URL/host/config, not a visible form field, so its issue key
 * would land on the hidden `organizationSlug` input and the form would fail
 * SILENTLY (the "nothing happens" bug). A form-level error is always visible.
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
    throw new NotFoundError("Organization is required");
  }

  const org = await prisma.organization.findUnique({
    where: { slug: normalized },
    select: { id: true },
  });

  if (!org) {
    throw new NotFoundError("Unknown organization");
  }

  return org.id;
}
