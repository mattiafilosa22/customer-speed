/**
 * Public surface of the invoice domain module. The Server Actions import these
 * use cases; they never reach into Prisma directly (docs/00 §1).
 */
export type { InvoiceActor, InvoiceDeps } from "@/server/invoices/deps";
export { buildInvoiceDeps } from "@/server/invoices/context-deps";

export {
  createInvoice,
  INVOICE_ERRORS,
  type CreateInvoiceResult,
} from "@/server/invoices/create-invoice";
export {
  listInvoices,
  type InvoiceItem,
  type InvoiceListResult,
} from "@/server/invoices/list-invoices";
export { deleteInvoice, type DeleteInvoiceResult } from "@/server/invoices/delete-invoice";

export {
  createInvoiceSchema,
  type CreateInvoiceInput,
} from "@/server/invoices/schemas";
