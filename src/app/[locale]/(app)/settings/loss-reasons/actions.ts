"use server";

import { revalidatePath } from "next/cache";

import { ForbiddenError, requirePermission } from "@/lib/rbac";
import { ConflictError, NotFoundError, UnauthorizedError, ValidationError } from "@/lib/errors";
import { requireTenantContext } from "@/lib/tenant";
import {
  buildLossReasonDeps,
  createLossReason,
  reorderLossReasons,
  setLossReasonActive,
  updateLossReason,
  type LossReasonItem,
} from "@/server/loss-reasons";

/**
 * Loss-reasons Settings Server Actions — the ONLY boundary the
 * `LossReasonsPanel` talks to (docs/00 §1, §4: UI → Server Action → use case
 * → Prisma). Gated by `settings.tenant` (proUser/superAdmin — NOT baseUser,
 * docs/02 §2.1), same capability as the appearance/data-retention panels.
 *
 * Invoked PROGRAMMATICALLY (client handlers, not `useActionState` forms), so
 * each action returns the updated typed item / result and THROWS a stable
 * i18n key on failure (mirrors `pipeline/actions.ts`) — the panel rolls back
 * its optimistic state and localizes the thrown message.
 */

function rethrowAsKey(error: unknown): never {
  if (error instanceof ValidationError) {
    throw new Error("lossReasons.errors.invalid");
  }
  if (error instanceof ConflictError) {
    // `createLossReason`/`updateLossReason` set `message` to the specific key.
    throw new Error(error.message);
  }
  if (error instanceof NotFoundError) {
    throw new Error("lossReasons.errors.notFound");
  }
  if (error instanceof UnauthorizedError || error instanceof ForbiddenError) {
    throw new Error("lossReasons.errors.unauthorized");
  }
  throw new Error("lossReasons.errors.generic");
}

function lossReasonsPath(): void {
  revalidatePath("/[locale]/(app)/settings/loss-reasons", "page");
}

export async function createLossReasonAction(args: { label: string }): Promise<LossReasonItem> {
  try {
    const ctx = await requireTenantContext();
    requirePermission(ctx.role, "settings.tenant");
    const deps = buildLossReasonDeps(ctx);
    const result = await createLossReason(deps, args);
    lossReasonsPath();
    return result;
  } catch (error) {
    rethrowAsKey(error);
  }
}

export async function updateLossReasonAction(args: {
  id: string;
  label: string;
}): Promise<LossReasonItem> {
  try {
    const ctx = await requireTenantContext();
    requirePermission(ctx.role, "settings.tenant");
    const deps = buildLossReasonDeps(ctx);
    const result = await updateLossReason(deps, args);
    lossReasonsPath();
    return result;
  } catch (error) {
    rethrowAsKey(error);
  }
}

export async function toggleLossReasonActiveAction(args: {
  id: string;
  isActive: boolean;
}): Promise<LossReasonItem> {
  try {
    const ctx = await requireTenantContext();
    requirePermission(ctx.role, "settings.tenant");
    const deps = buildLossReasonDeps(ctx);
    const result = await setLossReasonActive(deps, args);
    lossReasonsPath();
    // A newly-inactive reason must disappear from the "sposta in Perso"
    // picker; the picker is embedded in these pages.
    revalidatePath("/[locale]/(app)/pipeline", "page");
    revalidatePath("/[locale]/(app)/leads/[leadId]", "page");
    return result;
  } catch (error) {
    rethrowAsKey(error);
  }
}

export interface ReorderLossReasonsActionResult {
  readonly order: readonly string[];
}

export async function reorderLossReasonsAction(args: {
  order: string[];
}): Promise<ReorderLossReasonsActionResult> {
  try {
    const ctx = await requireTenantContext();
    requirePermission(ctx.role, "settings.tenant");
    const deps = buildLossReasonDeps(ctx);
    const result = await reorderLossReasons(deps, args);
    lossReasonsPath();
    return result;
  } catch (error) {
    rethrowAsKey(error);
  }
}
