import { NotFoundError } from "@/lib/errors";
import { parseInput } from "@/server/validation";
import type { InvoiceDeps } from "@/server/invoices/deps";
import { deleteInvoiceSchema } from "@/server/invoices/schemas";

/**
 * Delete an invoice (docs/04 §4.6 DELETE /invoices/:id). Hard delete: invoices
 * have no soft-delete column and are recreatable; removing a mistaken one must
 * actually drop it (and its contribution to the dashboard KPI).
 *
 * Ownership/tenant: a scoped read verifies the invoice belongs to the current
 * tenant first (a cross-tenant / missing id → 404, non-revealing), and yields the
 * `leadId` for the audit trail + revalidation. The delete is then itself
 * tenant-scoped by the client.
 */
export interface DeleteInvoiceResult {
  readonly id: string;
  readonly leadId: string;
}

export async function deleteInvoice(
  deps: InvoiceDeps,
  input: unknown,
): Promise<DeleteInvoiceResult> {
  const { invoiceId } = parseInput(deleteInvoiceSchema, input);

  const invoice = await deps.prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: { id: true, leadId: true },
  });
  if (!invoice) {
    throw new NotFoundError("Invoice not found");
  }

  await deps.prisma.invoice.delete({ where: { id: invoiceId } });

  await deps.audit.record({
    action: "invoice.delete",
    organizationId: deps.actor.organizationId,
    actorId: deps.actor.userId,
    entity: "Invoice",
    entityId: invoiceId,
    meta: { leadId: invoice.leadId },
  });

  return { id: invoiceId, leadId: invoice.leadId };
}
