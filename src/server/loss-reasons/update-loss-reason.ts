import { ConflictError, NotFoundError } from "@/lib/errors";
import { parseInput } from "@/server/validation";
import { isPrismaErrorCode } from "@/server/loss-reasons/prisma-errors";
import type { LossReasonDeps } from "@/server/loss-reasons/deps";
import { updateLossReasonSchema } from "@/server/loss-reasons/schemas";
import type { LossReasonItem } from "@/server/loss-reasons/types";

/**
 * Rename a tenant loss reason (Settings, docs/02 §2.5-bis). Isolation: the
 * `update` runs through the tenant-scoped client, so a cross-tenant/unknown id
 * matches no row — Prisma's `P2025` is mapped to `NotFoundError` (404, same
 * non-revealing behaviour as `updateLead`).
 */
export async function updateLossReason(
  deps: LossReasonDeps,
  input: unknown,
): Promise<LossReasonItem> {
  const data = parseInput(updateLossReasonSchema, input);

  const existing = await deps.prisma.lossReason.findFirst({
    where: { label: data.label, NOT: { id: data.id } },
    select: { id: true },
  });
  if (existing) {
    throw new ConflictError("lossReasons.errors.duplicateLabel");
  }

  try {
    return await deps.prisma.lossReason.update({
      where: { id: data.id },
      data: { label: data.label },
      select: { id: true, label: true, isActive: true, sortOrder: true },
    });
  } catch (error) {
    if (isPrismaErrorCode(error, "P2025")) {
      throw new NotFoundError("Loss reason not found");
    }
    if (isPrismaErrorCode(error, "P2002")) {
      throw new ConflictError("lossReasons.errors.duplicateLabel");
    }
    throw error;
  }
}
