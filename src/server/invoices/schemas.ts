import { z } from "zod";

/**
 * Zod schemas for the invoice domain (docs/04 §4.6) — single source of truth for
 * the input shapes at the Server Action boundary (docs/00 §2). Types inferred.
 *
 * Monetary inputs arrive as strings from the form. We validate them as
 * NON-NEGATIVE amounts with at most 2 decimals and a value bounded to the DB
 * column (`Decimal(12,2)` → max 9_999_999_999.99), then keep the canonical STRING
 * representation: the use case constructs a `Prisma.Decimal` from it, so no
 * float ever touches a money value (docs/00 §3). Parsing as a number only for
 * range/precision checks would risk binary-float rounding, hence the regex.
 */

/** Max value representable by Decimal(12,2): 10 digits before the point. */
const MAX_AMOUNT = 9_999_999_999.99;

/**
 * A money string: optional sign-free integer part + optional 1–2 decimals,
 * accepting both `.` and `,` as the decimal separator (Italian users type `,`).
 * Normalized to a dot-decimal canonical string for `Prisma.Decimal`.
 */
const money = z
  .string()
  .trim()
  .min(1, "Required")
  .transform((value) => value.replace(",", "."))
  .refine((value) => /^\d+(\.\d{1,2})?$/.test(value), {
    message: "Invalid amount",
  })
  .refine((value) => Number.parseFloat(value) <= MAX_AMOUNT, {
    message: "Amount too large",
  });

/** Optional invoice number: trimmed, bounded; empty string → undefined. */
const optionalNumber = z
  .string()
  .trim()
  .max(60)
  .optional()
  .or(z.literal("").transform(() => undefined));

/**
 * `issuedAt` comes from a date input (`YYYY-MM-DD`) or an ISO string. We parse it
 * to a `Date` (interpreted at UTC midnight for a bare date) and reject invalid
 * or absurdly-out-of-range values.
 */
const issuedAt = z.coerce
  .date()
  .refine((date) => !Number.isNaN(date.getTime()), { message: "Invalid date" })
  .refine((date) => date.getUTCFullYear() >= 2000 && date.getUTCFullYear() <= 2100, {
    message: "Date out of range",
  });

export const createInvoiceSchema = z
  .object({
    leadId: z.string().min(1, "Required"),
    number: optionalNumber,
    grossAmount: money,
    netAmount: money,
    issuedAt,
  })
  // Business rule: the net cannot exceed the gross (net = gross − taxes/fees).
  .refine((data) => Number.parseFloat(data.netAmount) <= Number.parseFloat(data.grossAmount), {
    message: "Net cannot exceed gross",
    path: ["netAmount"],
  });
export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;

export const listInvoicesSchema = z.object({
  leadId: z.string().min(1, "Required"),
});
export type ListInvoicesInput = z.infer<typeof listInvoicesSchema>;

export const deleteInvoiceSchema = z.object({
  invoiceId: z.string().min(1, "Required"),
});
export type DeleteInvoiceInput = z.infer<typeof deleteInvoiceSchema>;
