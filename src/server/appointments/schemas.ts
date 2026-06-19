import { z } from "zod";

import { AppointmentStatus } from "@/generated/prisma/enums";

/**
 * Zod schemas for the appointment domain (docs/02 §2.6, docs/04 §4.5) — the
 * single source of truth for the input shapes at every boundary (Server Action +
 * RSC query string), docs/00 §2. Types are inferred, never hand-written.
 *
 * Tenant ownership of `leadId` cannot be checked by Zod (no DB reach), so it is
 * verified in the use case against the tenant-scoped client; here we only assert
 * the shape (non-empty id or absent).
 */

/** A non-empty id (cuid-shaped, but we only require non-empty here). */
const id = z.string().min(1);

/** Optional lead link: empty string from a form → undefined (no link). */
const optionalLeadId = id.optional().or(z.literal("").transform(() => undefined));

const reason = z.string().trim().min(1, "Required").max(280);

/**
 * `startAt` arrives from a `datetime-local` input (`YYYY-MM-DDTHH:mm`) or an ISO
 * string. We coerce to a `Date`, reject invalid / absurd values, and store in
 * UTC (docs/00 §3). A bare `datetime-local` is interpreted by `new Date(...)` in
 * the runtime's local zone, which is fine: the value is rendered back through the
 * localized formatter (Europe/Rome) on read.
 */
const startAt = z.coerce
  .date()
  .refine((date) => !Number.isNaN(date.getTime()), { message: "Invalid date" })
  .refine((date) => date.getUTCFullYear() >= 2000 && date.getUTCFullYear() <= 2100, {
    message: "Date out of range",
  });

const status = z.nativeEnum(AppointmentStatus);

// --- Create / update -------------------------------------------------------

export const createAppointmentSchema = z.object({
  startAt,
  reason,
  leadId: optionalLeadId,
});
export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>;

/**
 * Update accepts a partial set. `leadId: null` explicitly clears the link;
 * `undefined`/absent leaves it untouched. Status is deliberately NOT editable
 * here: it has its own explicit use case (`changeAppointmentStatus`), so the
 * edit form only covers start/reason/lead.
 */
export const updateAppointmentSchema = z
  .object({
    startAt: startAt.optional(),
    reason: reason.optional(),
    leadId: optionalLeadId.nullable(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field is required",
  });
export type UpdateAppointmentInput = z.infer<typeof updateAppointmentSchema>;

// --- Change status ---------------------------------------------------------

export const changeAppointmentStatusSchema = z.object({
  status,
});
export type ChangeAppointmentStatusInput = z.infer<typeof changeAppointmentStatusSchema>;

// --- Get / delete ----------------------------------------------------------

export const appointmentIdSchema = z.object({ id });
export type AppointmentIdInput = z.infer<typeof appointmentIdSchema>;

// --- List ------------------------------------------------------------------

/**
 * Filter semantics for the list tabs (docs/02 §2.6):
 *  - `all`  → every appointment (any status),
 *  - `todo` → PENDING only ("Da fare"),
 *  - `done` → DONE only ("Fatti").
 *
 * CANCELED appointments are intentionally NOT a tab; they appear only under
 * "all" (they are neither pending work nor completed work). This keeps the three
 * screenshot tabs while not losing canceled rows.
 */
export const APPOINTMENT_FILTERS = ["all", "todo", "done"] as const;
export type AppointmentFilter = (typeof APPOINTMENT_FILTERS)[number];

export const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

/** Optional `YYYY-MM-DD` day filter (mini-calendar click). Empty → undefined. */
const optionalDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date")
  .optional()
  .or(z.literal("").transform(() => undefined));

export const listAppointmentsSchema = z.object({
  filter: z.enum(APPOINTMENT_FILTERS).default("all"),
  /** Optional restriction to one lead's appointments (lead detail panel). */
  leadId: optionalLeadId,
  /** Optional single-day filter (`YYYY-MM-DD`), from the mini-calendar. */
  date: optionalDate,
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});
export type ListAppointmentsInput = z.infer<typeof listAppointmentsSchema>;

// --- Month aggregate (mini-calendar) ---------------------------------------

export const monthSchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  /** 1–12 (human month), converted to a UTC range in the use case. */
  month: z.coerce.number().int().min(1).max(12),
});
export type MonthInput = z.infer<typeof monthSchema>;
