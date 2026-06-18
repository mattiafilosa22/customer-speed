import { Prisma } from "@/generated/prisma/client";
import { parseInput } from "@/server/validation";
import type { AppointmentDeps } from "@/server/appointments/deps";
import { monthSchema } from "@/server/appointments/schemas";

/**
 * App display time zone (matches the next-intl request config / formatters).
 * Day bucketing for the mini-calendar must use the SAME zone the user sees, so a
 * 23:30 appointment on the 5th is highlighted on the 5th (not pushed to the 6th
 * by a naive UTC truncation). Kept as a constant so it has one source of truth.
 */
const DISPLAY_TIME_ZONE = "Europe/Rome";

/**
 * Days of a month that have at least one appointment, for the sidebar
 * mini-calendar (docs/02 §2.6, docs/02 §2.7).
 *
 * DB-side aggregate (docs/00 §3 — never load the rows): a single grouped query
 * returns, per calendar day, the appointment count. We `date_trunc` to the day
 * in the DISPLAY time zone and bound to the requested month, so the result set is
 * at most ~31 small rows regardless of how many appointments exist.
 *
 * Tenant isolation: raw SQL bypasses the Prisma client extension, so the
 * `organizationId` filter is added EXPLICITLY here (parameterized — no string
 * interpolation), and the value comes from the server actor, never the client.
 */

export interface MonthAppointmentDay {
  /** Day of month, 1–31, in the display time zone. */
  readonly day: number;
  /** Number of appointments on that day. */
  readonly count: number;
}

export interface MonthAppointmentsResult {
  readonly year: number;
  readonly month: number;
  readonly days: readonly MonthAppointmentDay[];
}

/** Internal row shape returned by the grouped raw query. */
interface DayCountRow {
  readonly day: number;
  readonly count: bigint;
}

export async function getAppointmentsForMonth(
  deps: AppointmentDeps,
  input: unknown,
): Promise<MonthAppointmentsResult> {
  const { year, month } = parseInput(monthSchema, input);

  // Half-open month range computed by Postgres in the display zone:
  //   make_timestamptz(...) at the first instant of the month and of the next
  //   month, both at 00:00 in DISPLAY_TIME_ZONE. `startAt` (timestamptz) is then
  //   compared in absolute time, and bucketed to the day in the same zone.
  const rows = await deps.prisma.$queryRaw<DayCountRow[]>(Prisma.sql`
    SELECT
      EXTRACT(DAY FROM ("startAt" AT TIME ZONE ${DISPLAY_TIME_ZONE}))::int AS "day",
      COUNT(*)::bigint AS "count"
    FROM "Appointment"
    WHERE "organizationId" = ${deps.actor.organizationId}
      AND "startAt" >= make_timestamptz(${year}, ${month}, 1, 0, 0, 0, ${DISPLAY_TIME_ZONE})
      AND "startAt" <  (make_timestamptz(${year}, ${month}, 1, 0, 0, 0, ${DISPLAY_TIME_ZONE}) + INTERVAL '1 month')
    GROUP BY "day"
    ORDER BY "day"
  `);

  return {
    year,
    month,
    days: rows.map((row) => ({ day: row.day, count: Number(row.count) })),
  };
}
