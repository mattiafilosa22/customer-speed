import { Prisma } from "@/generated/prisma/client";
import { NotFoundError } from "@/lib/errors";
import { parseInput } from "@/server/validation";
import type { InvoiceDeps } from "@/server/invoices/deps";
import { listInvoicesSchema } from "@/server/invoices/schemas";
import { invoiceListSelect } from "@/server/invoices/selectors";

/**
 * List the invoices of a lead (docs/04 §4.6 GET /leads/:id/invoices), newest
 * `issuedAt` first.
 *
 * Ownership: the lead is verified through the tenant-scoped client (a
 * cross-tenant id is "not found" → 404). Invoices are then read tenant-scoped by
 * `leadId`, riding the `[leadId]` index.
 *
 * Money values are returned as canonical STRINGS (`Prisma.Decimal#toFixed(2)`)
 * so nothing crosses the server→client boundary as a non-serializable Decimal or
 * a lossy float. The list of one lead's invoices is naturally bounded (no
 * pagination needed here; the dashboard uses DB-side aggregates for totals).
 */

export interface InvoiceItem {
  readonly id: string;
  readonly number: string | null;
  /** Gross amount as a fixed-2 decimal string (e.g. "1200.00"). */
  readonly grossAmount: string;
  /** Net amount as a fixed-2 decimal string (e.g. "1000.00"). */
  readonly netAmount: string;
  readonly issuedAt: Date;
}

export interface InvoiceListResult {
  readonly data: readonly InvoiceItem[];
}

export async function listInvoices(
  deps: InvoiceDeps,
  input: unknown,
): Promise<InvoiceListResult> {
  const { leadId } = parseInput(listInvoicesSchema, input);

  const lead = await deps.prisma.lead.findUnique({
    where: { id: leadId },
    select: { id: true },
  });
  if (!lead) {
    throw new NotFoundError("Lead not found");
  }

  const rows = await deps.prisma.invoice.findMany({
    where: { leadId },
    select: invoiceListSelect,
    orderBy: { issuedAt: "desc" },
  });

  const data: InvoiceItem[] = rows.map((row) => ({
    id: row.id,
    number: row.number,
    grossAmount: new Prisma.Decimal(row.grossAmount).toFixed(2),
    netAmount: new Prisma.Decimal(row.netAmount).toFixed(2),
    issuedAt: row.issuedAt,
  }));

  return { data };
}
