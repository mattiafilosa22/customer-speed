"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";

import { requirePermission } from "@/lib/rbac";
import { ConflictError } from "@/lib/errors";
import { requireTenantContext } from "@/lib/tenant";
import { buildInvoiceDeps, createInvoice, deleteInvoice } from "@/server/invoices";
import {
  type ActionState,
  type ErrorKeyMap,
  fail,
  ok,
  toActionState,
} from "@/server/actions/action-result";

/**
 * Invoice Server Actions (docs/04 §4.6) — the ONLY boundary the invoice form
 * talks to (docs/00 §1, §4: UI → Server Action → use case; never UI → Prisma).
 *
 * Every action follows the mandatory order: auth (tenant context) → RBAC
 * (`invoice.create` — granted to proUser/superAdmin, NOT baseUser, docs/02 §2.1)
 * → build tenant-scoped deps → tested use case → revalidate → map typed errors
 * to STABLE i18n keys. The actor (org + user) comes from the SERVER context.
 *
 * Note: `invoice.create` is the single capability gating BOTH create and delete
 * (the matrix exposes one "Fatture" permission). A non-WON lead surfaces the
 * specific `ConflictError` key verbatim so the form can explain why.
 */

const errorKeys: ErrorKeyMap = {
  unauthorized: "invoices.errors.unauthorized",
  conflict: "invoices.errors.generic",
  notFound: "invoices.errors.notFound",
  rateLimited: "invoices.errors.generic",
  generic: "invoices.errors.generic",
  fieldErrorKey: (field) => `invoices.errors.fields.${field || "form"}`,
};

function str(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

/** Revalidate the surfaces whose data depends on invoices (detail + dashboard). */
function invoicePaths(leadId?: string): void {
  if (leadId) {
    revalidatePath(`/[locale]/(app)/leads/${leadId}`, "page");
  }
  // The dashboard KPI (net revenue) + invoice summary depend on invoices.
  revalidatePath("/[locale]/(app)/dashboard", "page");
}

export async function createInvoiceAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const ctx = await requireTenantContext();
    requirePermission(ctx.role, "invoice.create");
    const deps = buildInvoiceDeps(ctx);
    const leadId = str(form, "leadId");

    await createInvoice(deps, {
      leadId,
      number: str(form, "number") || undefined,
      grossAmount: str(form, "grossAmount"),
      netAmount: str(form, "netAmount"),
      issuedAt: str(form, "issuedAt"),
    });

    invoicePaths(leadId);
    return ok("invoices.create.success");
  } catch (error) {
    unstable_rethrow(error);
    // The "lead not WON" rule throws a ConflictError whose message IS a specific
    // i18n key — surface it verbatim so the form explains exactly why it failed.
    if (error instanceof ConflictError) {
      return fail(error.message);
    }
    return toActionState(error, errorKeys);
  }
}

export async function deleteInvoiceAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const ctx = await requireTenantContext();
    requirePermission(ctx.role, "invoice.create");
    const deps = buildInvoiceDeps(ctx);
    const result = await deleteInvoice(deps, { invoiceId: str(form, "invoiceId") });
    invoicePaths(result.leadId);
    return ok("invoices.delete.success");
  } catch (error) {
    unstable_rethrow(error);
    return toActionState(error, errorKeys);
  }
}
