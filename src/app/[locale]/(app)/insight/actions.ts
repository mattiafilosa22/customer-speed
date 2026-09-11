"use server";

import { revalidatePath } from "next/cache";

import { NotFoundError, ValidationError } from "@/lib/errors";
import { requirePermission } from "@/lib/rbac";
import { requireTenantContext, type TenantContext } from "@/lib/tenant";
import {
  buildInsightDeps,
  createLeadFromCell,
  listCellLeads,
  saveActivityDay,
  type CellLead,
} from "@/server/insight";
import { getTenantFeatureFlags } from "@/server/tenant/feature-flags";
import {
  fail,
  ok,
  toActionState,
  type ActionState,
  type ErrorKeyMap,
} from "@/server/actions/action-result";

const errorKeys: ErrorKeyMap = {
  unauthorized: "insight.errors.unauthorized",
  conflict: "insight.errors.generic",
  notFound: "insight.errors.notFound",
  rateLimited: "insight.errors.generic",
  generic: "insight.errors.generic",
  fieldErrorKey: (field) => `insight.errors.fields.${field || "form"}`,
};

function actionError(error: unknown): ActionState {
  if (error instanceof ValidationError) {
    return fail(
      undefined,
      Object.fromEntries(
        Object.entries(error.issues).map(([field, messages]) => [
          field,
          messages[0] ?? errorKeys.fieldErrorKey(field),
        ]),
      ),
    );
  }
  return toActionState(error, errorKeys);
}

async function requireInsightContext(
  capability: "insight.view" | "insight.edit",
): Promise<TenantContext> {
  const ctx = await requireTenantContext();
  const flags = await getTenantFeatureFlags(ctx.organizationId);
  if (!flags.insightStats) {
    throw new NotFoundError("Insight & Stats is disabled for this tenant");
  }
  requirePermission(ctx.role, capability);
  return ctx;
}

export async function saveActivityDayAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const ctx = await requireInsightContext("insight.edit");
    await saveActivityDay(buildInsightDeps(ctx), Object.fromEntries(form));
    revalidatePath("/[locale]/(app)/insight", "page");
    return ok("insight.saved");
  } catch (error) {
    return actionError(error);
  }
}

export async function createLeadFromCellAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const ctx = await requireInsightContext("insight.view");
    requirePermission(ctx.role, "lead.create");
    await createLeadFromCell(buildInsightDeps(ctx), Object.fromEntries(form));
    revalidatePath("/[locale]/(app)/insight", "page");
    revalidatePath("/[locale]/(app)/leads", "page");
    revalidatePath("/[locale]/(app)/appointments", "page");
    return ok("insight.newLead.success");
  } catch (error) {
    return actionError(error);
  }
}

export async function listCellLeadsAction(input: {
  readonly date: string;
  readonly group: string;
  readonly metric: string;
}): Promise<CellLead[]> {
  const ctx = await requireInsightContext("insight.view");
  return listCellLeads(buildInsightDeps(ctx), input);
}
