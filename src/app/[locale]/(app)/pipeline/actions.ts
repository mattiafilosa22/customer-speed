"use server";

import { revalidatePath } from "next/cache";

import { ForbiddenError, requirePermission } from "@/lib/rbac";
import {
  ConflictError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from "@/lib/errors";
import { requireTenantContext } from "@/lib/tenant";
import { buildLeadDeps, changeStage } from "@/server/leads";
import {
  buildPipelineDeps,
  reorderStages,
  setStageColor,
  updateStageVisibility,
} from "@/server/pipeline";
import type { LeadStage } from "@/generated/prisma/enums";

/**
 * Pipeline Server Actions — the ONLY boundary the kanban + config UI talk to
 * (docs/00 §1, §4: UI → Server Action → use case → service; never UI → Prisma).
 *
 * These actions are invoked PROGRAMMATICALLY (from TanStack Query mutations and
 * client handlers), not via `useActionState` forms, so they return a small typed
 * result and THROW a stable error code on failure. The caller (the optimistic
 * mutation) rolls back its cache on throw and localizes the code. The actor
 * (org + user) and the capability check come from the SERVER context — never the
 * client.
 */

export interface PipelineActionResult {
  readonly ok: true;
}

/**
 * Translate a thrown domain error to a STABLE i18n key string and rethrow as a
 * plain `Error` whose message is that key. Server Actions serialize only the
 * message to the client, so we never leak internals; `ConflictError` carries the
 * specific config-rule key as its message, which we pass through verbatim.
 */
function rethrowAsKey(error: unknown): never {
  if (error instanceof ValidationError) {
    throw new Error("pipeline.errors.invalid");
  }
  if (error instanceof ConflictError) {
    // The config use cases set `message` to a specific i18n key.
    throw new Error(error.message);
  }
  if (error instanceof NotFoundError) {
    throw new Error("pipeline.errors.notFound");
  }
  if (error instanceof UnauthorizedError || error instanceof ForbiddenError) {
    throw new Error("pipeline.errors.unauthorized");
  }
  throw new Error("pipeline.errors.generic");
}

function pipelinePaths(): void {
  revalidatePath("/[locale]/(app)/pipeline", "page");
  revalidatePath("/[locale]/(app)/dashboard", "page");
}

// ── Move a lead's stage (kanban drag&drop + keyboard "Sposta in…") ──────────────

export interface MoveLeadStageArgs {
  readonly leadId: string;
  readonly stage: LeadStage;
  readonly lossReasonId?: string;
  readonly lossReasonCustomText?: string;
}

/**
 * Move a lead to another stage from the board. Reuses the tested `changeStage`
 * use case (transaction + StageHistory + LOST→reason rule), gated by the
 * `pipeline.move` capability (baseUser allowed). Returns `{ ok }`; throws an
 * i18n key on failure so the optimistic mutation can roll back + localize.
 */
export async function moveLeadStageAction(
  args: MoveLeadStageArgs,
): Promise<PipelineActionResult> {
  try {
    const ctx = await requireTenantContext();
    requirePermission(ctx.role, "pipeline.move");
    const deps = buildLeadDeps(ctx);
    await changeStage(deps, args.leadId, {
      stage: args.stage,
      lossReasonId: args.lossReasonId,
      lossReasonCustomText: args.lossReasonCustomText,
    });
    pipelinePaths();
    revalidatePath(`/[locale]/(app)/leads/${args.leadId}`, "page");
    revalidatePath("/[locale]/(app)/leads", "page");
    return { ok: true };
  } catch (error) {
    rethrowAsKey(error);
  }
}

// ── Configure stages (proUser/superAdmin only) ──────────────────────────────────

export async function setStageVisibilityAction(args: {
  stage: LeadStage;
  isVisible: boolean;
}): Promise<PipelineActionResult> {
  try {
    const ctx = await requireTenantContext();
    requirePermission(ctx.role, "pipeline.configureStages");
    const deps = buildPipelineDeps(ctx);
    await updateStageVisibility(deps, args);
    pipelinePaths();
    return { ok: true };
  } catch (error) {
    rethrowAsKey(error);
  }
}

export async function reorderStagesAction(args: {
  order: LeadStage[];
}): Promise<PipelineActionResult> {
  try {
    const ctx = await requireTenantContext();
    requirePermission(ctx.role, "pipeline.configureStages");
    const deps = buildPipelineDeps(ctx);
    await reorderStages(deps, args);
    pipelinePaths();
    return { ok: true };
  } catch (error) {
    rethrowAsKey(error);
  }
}

export async function setStageColorAction(args: {
  stage: LeadStage;
  colorToken: string | null;
}): Promise<PipelineActionResult> {
  try {
    const ctx = await requireTenantContext();
    requirePermission(ctx.role, "pipeline.configureStages");
    const deps = buildPipelineDeps(ctx);
    await setStageColor(deps, args);
    pipelinePaths();
    return { ok: true };
  } catch (error) {
    rethrowAsKey(error);
  }
}
