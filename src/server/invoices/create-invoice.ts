import { Prisma } from "@/generated/prisma/client";
import { LeadStage } from "@/generated/prisma/enums";
import { ConflictError, NotFoundError } from "@/lib/errors";
import { parseInput } from "@/server/validation";
import type { InvoiceDeps } from "@/server/invoices/deps";
import { createInvoiceSchema } from "@/server/invoices/schemas";

/**
 * Create an invoice for a lead (docs/02 §2.5, docs/04 §4.6 POST /leads/:id/invoices).
 *
 * Invariants enforced here:
 *  1. **Ownership** — the lead is looked up via the tenant-scoped client, so a
 *     cross-tenant / soft-deleted lead is simply not found → `NotFoundError` (404,
 *     non-revealing: cannot distinguish "missing" from "other tenant").
 *  2. **WON only** — an invoice may only be attached to a WON lead (docs/02 §2.2:
 *     fatturato è "dei lead vinti"; the detail "Aggiungi fattura" is enabled only
 *     for won leads). A non-WON lead → `ConflictError` (409) with a stable key.
 *  3. **Decimal money** — `grossAmount`/`netAmount` are constructed as
 *     `Prisma.Decimal` from the validated canonical strings; no float is ever
 *     used for a monetary value (docs/00 §3).
 *
 * `organizationId` is injected by the tenant client on the create; we pass it
 * explicitly too so the static type is satisfied and the value is unambiguous.
 */

/** Stable i18n error keys surfaced by this use case (mapped by the action layer). */
export const INVOICE_ERRORS = {
  leadNotWon: "invoices.errors.leadNotWon",
} as const;

export interface CreateInvoiceResult {
  readonly id: string;
}

export async function createInvoice(
  deps: InvoiceDeps,
  input: unknown,
): Promise<CreateInvoiceResult> {
  const data = parseInput(createInvoiceSchema, input);

  const lead = await deps.prisma.lead.findUnique({
    where: { id: data.leadId },
    select: { id: true, stage: true },
  });
  if (!lead) {
    throw new NotFoundError("Lead not found");
  }
  if (lead.stage !== LeadStage.WON) {
    throw new ConflictError(INVOICE_ERRORS.leadNotWon);
  }

  const created = await deps.prisma.invoice.create({
    data: {
      organizationId: deps.actor.organizationId,
      leadId: data.leadId,
      number: data.number ?? null,
      grossAmount: new Prisma.Decimal(data.grossAmount),
      netAmount: new Prisma.Decimal(data.netAmount),
      issuedAt: data.issuedAt,
    },
    select: { id: true },
  });

  await deps.audit.record({
    action: "invoice.create",
    organizationId: deps.actor.organizationId,
    actorId: deps.actor.userId,
    entity: "Invoice",
    entityId: created.id,
    meta: { leadId: data.leadId },
  });

  return { id: created.id };
}
