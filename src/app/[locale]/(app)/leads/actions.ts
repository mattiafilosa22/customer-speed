"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";

import { asLocale, routing } from "@/i18n/routing";
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
  buildErasureDeps,
  buildExportDeps,
  eraseLeadData,
  exportLeadData,
  exportLeadDataXlsx,
  type LeadDataExport,
} from "@/server/privacy";
import {
  type ActionState,
  type ErrorKeyMap,
  fail,
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
      capitalAmount: str(form, "capitalAmount") || undefined,
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

/**
 * Capability `lead.setCapital`: inline save of the capital. The user picks a
 * mode (exact amount OR bracket) — we forward BOTH raw fields and the use case
 * (`resolveCapital`) decides: an exact amount wins and DERIVES the bracket
 * server-side, otherwise the bracket is stored and the amount cleared; both
 * empty clears the capital. The client is never trusted for the bracket.
 */
export async function setCapitalAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const ctx = await requireTenantContext();
    requirePermission(ctx.role, "lead.setCapital");
    const deps = buildLeadDeps(ctx);
    const leadId = str(form, "leadId");
    const mode = str(form, "capitalMode");
    // Only forward the field for the chosen mode (the other is explicitly
    // cleared by passing an empty value), so switching modes resets the other.
    await updateLead(deps, leadId, {
      capitalAmount: mode === "amount" ? str(form, "capitalAmount") || null : null,
      capitalBracket: mode === "amount" ? null : str(form, "capitalBracket") || null,
    });
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
  } catch (error) {
    unstable_rethrow(error);
    return toActionState(error, errorKeys);
  }

  // Navigate to the list on the SERVER. The delete is triggered from the lead
  // detail page; after a Server Action Next refreshes the current route, which
  // would re-run `getLead` for the just-soft-deleted lead → `notFound()` and,
  // with no not-found boundary, a blank page. Redirecting server-side leaves the
  // detail route before that refresh, so the user lands cleanly on the list.
  // Locale-aware (`as-needed` prefix), mirroring the login redirect.
  const locale = asLocale(str(form, "locale"));
  redirect(locale === routing.defaultLocale ? "/leads" : `/${locale}/leads`);
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

// ── GDPR Data Subject Requests (export / erasure) ──────────────────────────────

const gdprErrorKeys: ErrorKeyMap = {
  ...errorKeys,
  fieldErrorKey: (field) => `gdpr.errors.fields.${field || "form"}`,
};

/**
 * Discriminated result for the EXPORT action: on success it carries the
 * structured JSON payload (so the client can offer it as a download) plus a
 * suggested filename; on failure it reuses the form `ActionState` so the dialog
 * can show a localized, non-revealing error.
 */
export type ExportLeadResult =
  | { status: "success"; filename: string; data: LeadDataExport }
  | (ActionState & { status: "error" });

/**
 * Export a lead's personal data (right of access/portability, docs/06 §6.5).
 * Full chain: auth → RBAC (`lead.exportData`) → tenant-scoped deps → use case
 * (audited) → typed payload. The actor is taken from the server context.
 */
export async function exportLeadDataAction(leadId: string): Promise<ExportLeadResult> {
  try {
    const ctx = await requireTenantContext();
    requirePermission(ctx.role, "lead.exportData");
    const deps = buildExportDeps(ctx);
    const data = await exportLeadData(deps, leadId);
    return { status: "success", filename: `lead-${leadId}-export.json`, data };
  } catch (error) {
    unstable_rethrow(error);
    // `toActionState` always yields an error state here (we only reach this on a
    // thrown domain error); narrow it for the discriminated return type.
    const state = toActionState(error, gdprErrorKeys);
    if (state.status === "error") return state;
    return fail(gdprErrorKeys.generic) as ActionState & { status: "error" };
  }
}

/**
 * Discriminated result for the EXCEL export: on success it carries the .xlsx as
 * base64 (Server Actions can't return a Buffer/Blob over the wire) + filename;
 * the client decodes it into the spreadsheet Blob and downloads it. On failure
 * it reuses the form `ActionState` (localized, non-revealing).
 */
export type ExportLeadXlsxResult =
  | { status: "success"; filename: string; base64: string }
  | (ActionState & { status: "error" });

/**
 * Export a lead's personal data as Excel (.xlsx) (right of access/portability,
 * docs/06 §6.5, audit P0.2). Same chain as the JSON export: auth → RBAC
 * (`lead.exportData`) → tenant-scoped deps → use case (audited, `format: xlsx`)
 * → base64 payload. Same minimization as JSON (one shared collector).
 */
export async function exportLeadDataXlsxAction(
  leadId: string,
): Promise<ExportLeadXlsxResult> {
  try {
    const ctx = await requireTenantContext();
    requirePermission(ctx.role, "lead.exportData");
    const deps = buildExportDeps(ctx);
    const { filename, buffer } = await exportLeadDataXlsx(deps, leadId);
    return { status: "success", filename, base64: buffer.toString("base64") };
  } catch (error) {
    unstable_rethrow(error);
    const state = toActionState(error, gdprErrorKeys);
    if (state.status === "error") return state;
    return fail(gdprErrorKeys.generic) as ActionState & { status: "error" };
  }
}

/**
 * Erase / anonymize a lead's personal data (right to be forgotten, docs/06
 * §6.5). Destructive → gated by the dedicated `lead.eraseData` capability and a
 * client confirm dialog. Idempotent in the use case. Uses the form `ActionState`
 * so the confirm dialog localizes success/error.
 */
export async function eraseLeadDataAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const ctx = await requireTenantContext();
    requirePermission(ctx.role, "lead.eraseData");
    const deps = buildErasureDeps(ctx);
    await eraseLeadData(deps, str(form, "leadId"));
    leadPaths();
    return ok("gdpr.erase.success");
  } catch (error) {
    unstable_rethrow(error);
    return toActionState(error, gdprErrorKeys);
  }
}
