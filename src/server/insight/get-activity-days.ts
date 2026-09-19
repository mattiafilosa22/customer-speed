import { parseInput } from "@/server/validation";
import { periodRange } from "@/server/dashboard/period";
import type { InsightDeps } from "@/server/insight/deps";
import { monthSchema } from "@/server/insight/schemas";

/**
 * Righe giornaliere del mese: i contatori digitati a mano e, per i giorni di
 * archivio, i conteggi congelati importati dall'Excel.
 *
 * Restituisce SOLO i giorni che hanno una riga: i giorni senza attività non
 * esistono a database (nessuna riga vuota scritta in anticipo) e la UI li
 * completa a zero. Una query sola, range scan su `[organizationId, date]`.
 */
export interface ActivityDayRow {
  readonly date: Date;
  readonly welcomeSent: number;
  readonly welcomeReplies: number;
  readonly outboundComments: number;
  readonly outboundStories: number;
  readonly outboundReplies: number;
  readonly inboundReceived: number;
  readonly isArchived: boolean;
  readonly archivedOutboundMessages: number | null;
  readonly archivedWelcomeAppointments: number | null;
  readonly archivedWelcomeSales: number | null;
  readonly archivedOutboundAppointments: number | null;
  readonly archivedOutboundSales: number | null;
  readonly archivedInboundAppointments: number | null;
  readonly archivedInboundSales: number | null;
}

export async function getActivityDays(
  deps: InsightDeps,
  input: unknown,
): Promise<ActivityDayRow[]> {
  const { year, month } = parseInput(monthSchema, input);
  const monthBounds = periodRange(year, month);

  return deps.prisma.chatActivityDay.findMany({
    where: { date: { gte: monthBounds.gte, lt: monthBounds.lt } },
    orderBy: { date: "asc" },
    select: {
      date: true,
      welcomeSent: true,
      welcomeReplies: true,
      outboundComments: true,
      outboundStories: true,
      outboundReplies: true,
      inboundReceived: true,
      isArchived: true,
      archivedOutboundMessages: true,
      archivedWelcomeAppointments: true,
      archivedWelcomeSales: true,
      archivedOutboundAppointments: true,
      archivedOutboundSales: true,
      archivedInboundAppointments: true,
      archivedInboundSales: true,
    },
  });
}
