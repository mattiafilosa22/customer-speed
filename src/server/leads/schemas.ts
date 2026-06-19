import { z } from "zod";

import { CapitalBracket, LeadStage } from "@/generated/prisma/enums";

/**
 * Zod schemas for the lead domain — single source of truth for the input shapes
 * at every boundary (Server Action + Route Handler), docs/00 §2. Types are
 * inferred, never hand-written.
 *
 * Contact fields mirror docs/04 §4.3 validation:
 *   - email: valid format WHEN present (optional),
 *   - phone: trimmed, length-bounded (light normalization — no country logic),
 *   - capitalBracket / stage / sourceId: enum / id membership (ownership of
 *     sourceId & lossReasonId is verified against the tenant in the use case,
 *     not here, since Zod cannot reach the DB).
 */

// --- Reusable field schemas -----------------------------------------------

const name = z.string().trim().min(1, "Required").max(120);

/**
 * Optional email: an empty string from a form means "not provided" → undefined,
 * a non-empty value must be a valid, normalized (lowercase) email.
 */
const optionalEmail = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .email("Invalid email")
  .optional()
  .or(z.literal("").transform(() => undefined));

/** Optional phone: light normalization (trim + bounded length); no E.164 parse. */
const optionalPhone = z
  .string()
  .trim()
  .max(40)
  .optional()
  .or(z.literal("").transform(() => undefined));

const capitalBracket = z.nativeEnum(CapitalBracket);
const stage = z.nativeEnum(LeadStage);

/** Exclusive upper bound for an exact capital amount (€): keep it < 1e12. */
const MAX_CAPITAL_AMOUNT = 1e12;

/**
 * Exact capital amount (€). Accepts either a number or a form string using `.`
 * or `,` as the decimal separator (and optional thousands separators), which is
 * normalized to a number. An empty string means "not provided" → undefined (so
 * the use case can clear the column). The value must be finite, `>= 0` and
 * `< 1e12`; the bracket is DERIVED from it server-side, never sent by the client.
 */
const optionalCapitalAmount = z
  .union([z.number(), z.string(), z.null()])
  .transform((raw, ctx) => {
    // null / "" clear the column → null.
    if (raw === null) return null;
    if (typeof raw === "number") return raw;
    const trimmed = raw.trim();
    if (trimmed === "") return null;
    // Normalize "1.234,50" / "1234,50" / "1234.50" → 1234.50: drop grouping dots
    // when a comma decimal is present, else treat comma as the decimal separator.
    const hasComma = trimmed.includes(",");
    const normalized = hasComma ? trimmed.replace(/\./g, "").replace(",", ".") : trimmed;
    const value = Number(normalized);
    if (!Number.isFinite(value)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid amount" });
      return z.NEVER;
    }
    return value;
  })
  .pipe(
    z
      .number()
      .nonnegative("Amount must be ≥ 0")
      .lt(MAX_CAPITAL_AMOUNT, "Amount too large")
      .nullable(),
  )
  // The whole field is optional at the OBJECT level: an absent key leaves the
  // column untouched (PATCH semantics); a present null / "" clears it.
  .optional();

/** A non-empty id (cuid-shaped, but we only require non-empty here). */
const id = z.string().min(1);
const optionalId = id.optional().or(z.literal("").transform(() => undefined));

// --- Create / update lead --------------------------------------------------

export const createLeadSchema = z.object({
  firstName: name,
  lastName: name,
  email: optionalEmail,
  phone: optionalPhone,
  // Capital on create: an exact amount OR a bracket (the amount wins and the
  // bracket is derived in the use case). Both optional.
  capitalAmount: optionalCapitalAmount,
  capitalBracket: capitalBracket.optional(),
  sourceId: optionalId,
});
export type CreateLeadInput = z.infer<typeof createLeadSchema>;

/**
 * Update accepts a partial set of contact / capital / source fields. `null`
 * explicitly clears a nullable column (capitalBracket, sourceId, email, phone);
 * `undefined`/absent leaves it untouched. Stage is NOT updatable here — it has
 * its own atomic use case (`changeStage`) that also writes `StageHistory`.
 */
export const updateLeadSchema = z
  .object({
    firstName: name.optional(),
    lastName: name.optional(),
    email: optionalEmail.nullable(),
    phone: optionalPhone.nullable(),
    capitalBracket: capitalBracket.nullable().optional(),
    capitalAmount: optionalCapitalAmount,
    sourceId: optionalId.nullable(),
    adminNotes: z.string().trim().max(5000).nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field is required",
  });
export type UpdateLeadInput = z.infer<typeof updateLeadSchema>;

// --- Set capital (exact amount OR bracket) ---------------------------------

/**
 * Inline "imposta capitale" payload (docs/02 §2.4). The user chooses EITHER an
 * exact amount OR a bracket; the bracket is then DERIVED from the amount in the
 * use case (never trusted from the client when an amount is present). Both
 * fields optional/nullable: when both are empty the use case clears the capital.
 */
export const setCapitalSchema = z.object({
  capitalAmount: optionalCapitalAmount,
  capitalBracket: capitalBracket.nullable().optional(),
});
export type SetCapitalInput = z.infer<typeof setCapitalSchema>;

// --- Change stage ----------------------------------------------------------

/**
 * Stage change. When the target is `LOST`, `lossReasonId` is REQUIRED
 * (docs/02 §2.5, docs/04 §4.3) — enforced here at the schema level via a
 * discriminated refine, and the id is then verified to belong to the tenant in
 * the use case.
 */
export const changeStageSchema = z
  .object({
    stage,
    lossReasonId: optionalId,
  })
  .refine((data) => data.stage !== LeadStage.LOST || Boolean(data.lossReasonId), {
    message: "lossReasonId is required when moving to LOST",
    path: ["lossReasonId"],
  });
export type ChangeStageInput = z.infer<typeof changeStageSchema>;

// --- Notes -----------------------------------------------------------------

export const createNoteSchema = z.object({
  body: z.string().trim().min(1, "Required").max(5000),
});
export type CreateNoteInput = z.infer<typeof createNoteSchema>;

export const updateNoteSchema = createNoteSchema;
export type UpdateNoteInput = z.infer<typeof updateNoteSchema>;

// --- External CRM ref ("Aggiornamento dati") -------------------------------

export const createExternalRefSchema = z
  .object({
    altName: z
      .string()
      .trim()
      .max(120)
      .optional()
      .or(z.literal("").transform(() => undefined)),
    altEmail: optionalEmail,
    source: z
      .string()
      .trim()
      .max(120)
      .optional()
      .or(z.literal("").transform(() => undefined)),
  })
  .refine((data) => Boolean(data.altName ?? data.altEmail ?? data.source), {
    message: "At least one alternative value is required",
  });
export type CreateExternalRefInput = z.infer<typeof createExternalRefSchema>;

// --- List leads (query) ----------------------------------------------------

export const LEAD_SORTS = ["default", "days_asc", "days_desc"] as const;
export type LeadSort = (typeof LEAD_SORTS)[number];

export const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

/**
 * List query: search text, stage tab, source filter, period (year/month),
 * minimum-days filter, sort and pagination. Coerced from URL searchParams /
 * REST query strings, so everything starts as a string.
 */
export const listLeadsSchema = z.object({
  query: z
    .string()
    .trim()
    .max(120)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  stage: stage.optional(),
  sourceId: optionalId,
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
  minDays: z.coerce.number().int().min(0).max(3650).optional(),
  sort: z.enum(LEAD_SORTS).default("default"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});
export type ListLeadsInput = z.infer<typeof listLeadsSchema>;
