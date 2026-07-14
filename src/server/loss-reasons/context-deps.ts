import { getTenantPrisma } from "@/lib/prisma-tenant";
import type { TenantContext } from "@/lib/tenant";
import type { LossReasonDeps } from "@/server/loss-reasons/deps";

/**
 * Build `LossReasonDeps` from an authenticated tenant context (the wiring used
 * by the Settings Server Actions and by the read-only picker in
 * `src/server/leads/reference-data.ts`).
 *
 * The Prisma surface is the TENANT-SCOPED client (forces `organizationId`), and
 * the actor identity comes from the SERVER context — never client input
 * (docs/00 §4, docs/06 §6.3).
 */
export function buildLossReasonDeps(ctx: TenantContext): LossReasonDeps {
  return {
    prisma: getTenantPrisma(ctx),
    actor: { organizationId: ctx.organizationId, userId: ctx.userId },
  };
}
