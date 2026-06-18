import { Prisma } from "@/generated/prisma/client";

/**
 * Centralized Prisma `select` for the invoice list (docs/00 §3: explicit selects,
 * never `SELECT *`). Declared with `satisfies` so it feeds `GetPayload` types —
 * a single source of truth for the query and the returned row type.
 */
export const invoiceListSelect = {
  id: true,
  number: true,
  grossAmount: true,
  netAmount: true,
  issuedAt: true,
  createdAt: true,
} satisfies Prisma.InvoiceSelect;

export type InvoiceListRow = Prisma.InvoiceGetPayload<{ select: typeof invoiceListSelect }>;
