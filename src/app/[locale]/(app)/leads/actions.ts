"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";

import { requirePermission } from "@/lib/rbac";
import { requireTenantContext } from "@/lib/tenant";
import {
  buildLeadDeps,
  changeStage,
  createExternalRef,
  createLead,
  createNote,
  deleteExternalRef,
  deleteNote,
  softDeleteLead,
  updateLead,
  updateNote,
} from "@/server/leads";
import {
  type ActionState,
  type ErrorKeyMap,
  ok,
  toActionState,
} from "@/server/actions/action-result";

/**
 * Lead Server Actions — the ONLY boundary the lead forms talk to (docs/00 §1, §4:
 * UI → Server Action → use case → service; never UI → Prisma).
 *
 * Every action follows the mandatory order: auth (tenant context) → RBAC
 * (`requirePermission`) → build tenant-scoped deps → delegate to the tested use
 * case → revalidate → map typed errors to i18n keys. The actor (org + user) is
 * taken from the SERVER context, never from the client.
 */

const errorKeys: ErrorKeyMap = {
  unauthorized: "leads.errors.unauthorized",
  conflict: "leads.errors.generic",
  notFound: "leads.errors.notFound",
  rateLimited: "leads.errors.generic",
  generic: "leads.errors.generic",
  fieldErrorKey: (field) => `leads.errors.fields.${field || "form"}`,
};

const noteErrorKeys: ErrorKeyMap = {
  ...errorKeys,
  fieldErrorKey: (field) => `notes.errors.fields.${field || "body"}`,
};

function str(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

/** Optional string: returns undefined for absent fields so PATCH semantics work. */
function optionalStr(form: FormData, name: string): string | undefined {
  return form.has(name) ? str(form, name) : undefined;
}

function leadPaths(leadId?: string): void {
  revalidatePath("/[locale]/(app)/leads", "page");
  if (leadId) {
    revalidatePath(`/[locale]/(app)/leads/${leadId}`, "page");
  }
  // Pipeline + dashboard counters depend on stage/count.
  revalidatePath("/[locale]/(app)/pipeline", "page");
  revalidatePath("/[locale]/(app)/dashboard", "page");
}

// ── Create ────────────────────────────────────────────────────────────────────

export async function createLeadAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const ctx = await requireTenantContext();
    requirePermission(ctx.role, "lead.create");
    const deps = buildLeadDeps(ctx);

    await createLead(deps, {
      firstName: str(form, "firstName"),
      lastName: str(form, "lastName"),
      email: str(form, "email"),
      phone: str(form, "phone"),
      capitalBracket: str(form, "capitalBracket") || undefined,
      sourceId: str(form, "sourceId") || undefined,
    });

    leadPaths();
    return ok("leads.create.success");
  } catch (error) {
    unstable_rethrow(error);
    return toActionState(error, errorKeys);
  }
}

// ── Update contact / capital / source / admin notes ─────────────────────────────

export async function updateLeadAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const ctx = await requireTenantContext();
    requirePermission(ctx.role, "lead.update");
    const deps = buildLeadDeps(ctx);
    const leadId = str(form, "leadId");

    // Only forward keys actually present in the form (partial PATCH semantics).
    const patch: Record<string, string | undefined> = {};
    for (const key of ["firstName", "lastName", "email", "phone", "adminNotes", "sourceId"]) {
      const value = optionalStr(form, key);
      if (value !== undefined) patch[key] = value;
    }
    if (form.has("capitalBracket")) {
      patch.capitalBracket = str(form, "capitalBracket") || "";
    }

    await updateLead(deps, leadId, patch);
    leadPaths(leadId);
    return ok("leads.update.success");
  } catch (error) {
    unstable_rethrow(error);
    return toActionState(error, errorKeys);
  }
}

/** Capability `lead.setCapital`: inline single-field save of the capital bracket. */
export async function setCapitalAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const ctx = await requireTenantContext();
    requirePermission(ctx.role, "lead.setCapital");
    const deps = buildLeadDeps(ctx);
    const leadId = str(form, "leadId");
    await updateLead(deps, leadId, { capitalBracket: str(form, "capitalBracket") || null });
    leadPaths(leadId);
    return ok("leads.update.success");
  } catch (error) {
    unstable_rethrow(error);
    return toActionState(error, errorKeys);
  }
}

/** Inline single-field save of the lead source (capability `lead.update`). */
export async function setSourceAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const ctx = await requireTenantContext();
    requirePermission(ctx.role, "lead.update");
    const deps = buildLeadDeps(ctx);
    const leadId = str(form, "leadId");
    await updateLead(deps, leadId, { sourceId: str(form, "sourceId") || null });
    leadPaths(leadId);
    return ok("leads.update.success");
  } catch (error) {
    unstable_rethrow(error);
    return toActionState(error, errorKeys);
  }
}

// ── Change stage ────────────────────────────────────────────────────────────────

export async function changeStageAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const ctx = await requireTenantContext();
    requirePermission(ctx.role, "pipeline.move");
    const deps = buildLeadDeps(ctx);
    const leadId = str(form, "leadId");

    await changeStage(deps, leadId, {
      stage: str(form, "stage"),
      lossReasonId: str(form, "lossReasonId") || undefined,
    });

    leadPaths(leadId);
    return ok("leads.stage.success");
  } catch (error) {
    unstable_rethrow(error);
    return toActionState(error, errorKeys);
  }
}

// ── Delete (soft) ───────────────────────────────────────────────────────────────

export async function deleteLeadAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const ctx = await requireTenantContext();
    requirePermission(ctx.role, "lead.delete");
    const deps = buildLeadDeps(ctx);
    await softDeleteLead(deps, str(form, "leadId"));
    leadPaths();
    return ok("leads.delete.success");
  } catch (error) {
    unstable_rethrow(error);
    return toActionState(error, errorKeys);
  }
}

// ── Notes ───────────────────────────────────────────────────────────────────────

export async function createNoteAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const ctx = await requireTenantContext();
    requirePermission(ctx.role, "lead.note");
    const deps = buildLeadDeps(ctx);
    const leadId = str(form, "leadId");
    await createNote(deps, leadId, { body: str(form, "body") });
    leadPaths(leadId);
    return ok("notes.create.success");
  } catch (error) {
    unstable_rethrow(error);
    return toActionState(error, noteErrorKeys);
  }
}

export async function updateNoteAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const ctx = await requireTenantContext();
    requirePermission(ctx.role, "lead.note");
    const deps = buildLeadDeps(ctx);
    const result = await updateNote(deps, str(form, "noteId"), { body: str(form, "body") });
    leadPaths(result.leadId);
    return ok("notes.update.success");
  } catch (error) {
    unstable_rethrow(error);
    return toActionState(error, noteErrorKeys);
  }
}

export async function deleteNoteAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const ctx = await requireTenantContext();
    requirePermission(ctx.role, "lead.note");
    const deps = buildLeadDeps(ctx);
    const result = await deleteNote(deps, str(form, "noteId"));
    leadPaths(result.leadId);
    return ok("notes.delete.success");
  } catch (error) {
    unstable_rethrow(error);
    return toActionState(error, noteErrorKeys);
  }
}

// ── External CRM refs ("Aggiornamento dati") ────────────────────────────────────

export async function createExternalRefAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const ctx = await requireTenantContext();
    requirePermission(ctx.role, "lead.note");
    const deps = buildLeadDeps(ctx);
    const leadId = str(form, "leadId");
    await createExternalRef(deps, leadId, {
      altName: str(form, "altName"),
      altEmail: str(form, "altEmail"),
      source: str(form, "source"),
    });
    leadPaths(leadId);
    return ok("externalRefs.create.success");
  } catch (error) {
    unstable_rethrow(error);
    return toActionState(error, {
      ...errorKeys,
      fieldErrorKey: (field) => `externalRefs.errors.fields.${field || "form"}`,
    });
  }
}

export async function deleteExternalRefAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const ctx = await requireTenantContext();
    requirePermission(ctx.role, "lead.note");
    const deps = buildLeadDeps(ctx);
    await deleteExternalRef(deps, str(form, "refId"));
    leadPaths(str(form, "leadId") || undefined);
    return ok("externalRefs.delete.success");
  } catch (error) {
    unstable_rethrow(error);
    return toActionState(error, errorKeys);
  }
}
