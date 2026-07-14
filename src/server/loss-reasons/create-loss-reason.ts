import { ConflictError } from "@/lib/errors";
import { parseInput } from "@/server/validation";
import { isPrismaErrorCode } from "@/server/loss-reasons/prisma-errors";
import type { LossReasonDeps } from "@/server/loss-reasons/deps";
import { createLossReasonSchema } from "@/server/loss-reasons/schemas";
import type { LossReasonItem } from "@/server/loss-reasons/types";

/**
 * Create a tenant loss reason (Settings, docs/02 §2.5-bis). Appended at the END
 * of the tenant's list (`sortOrder = max(sortOrder) + 1`), active by default.
 *
 * Uniqueness (`@@unique([organizationId, label])`): pre-checked for a clean
 * field-level error, with the DB constraint as the authoritative guard against
 * a race (surfaced as the same typed `ConflictError`) — mirrors
 * `createOrganization`'s slug check.
 */
export async function createLossReason(
  deps: LossReasonDeps,
  input: unknown,
): Promise<LossReasonItem> {
  const data = parseInput(createLossReasonSchema, input);

  const existing = await deps.prisma.lossReason.findFirst({
    where: { label: data.label },
    select: { id: true },
  });
  if (existing) {
    throw new ConflictError("lossReasons.errors.duplicateLabel");
  }

  const last = await deps.prisma.lossReason.findFirst({
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  const sortOrder = (last?.sortOrder ?? -1) + 1;

  try {
    return await deps.prisma.lossReason.create({
      data: {
        // Explicit for the static type; the tenant client re-injects the same
        // value at the data layer (mirrors `stageHistory.create` in change-stage.ts).
        organizationId: deps.actor.organizationId,
        label: data.label,
        sortOrder,
      },
      select: { id: true, label: true, isActive: true, sortOrder: true },
    });
  } catch (error) {
    if (isPrismaErrorCode(error, "P2002")) {
      throw new ConflictError("lossReasons.errors.duplicateLabel");
    }
    throw error;
  }
}
