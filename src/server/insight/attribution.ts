import { periodRange } from "@/server/dashboard/period";
import { channelGroupOf, type ChannelGroup } from "@/server/insight/channels";
import { utcDayKey } from "@/server/insight/counts";
import type { InsightConfig } from "@/server/insight/config";
import type { InsightDeps } from "@/server/insight/deps";
import type { MonthInput } from "@/server/insight/schemas";

/**
 * Un lead di provenienza collegata attribuito al mese, con il giorno e la
 * colonna a cui va imputato. Condiviso da `get-appointment-counts.ts` (Task 5)
 * e `get-sale-counts.ts` (Task 6), e riletto dal drill-down (Task 12): la
 * regola di attribuzione va scritta una volta sola.
 */
export interface AttributedLead {
  readonly leadId: string;
  readonly dayKey: string; // "YYYY-MM-DD" UTC
  readonly group: ChannelGroup; // "welcome" | "outbound" | "inbound"
  readonly createdFromInsight: boolean;
}

/**
 * Lead attribuiti al mese per gli APPUNTAMENTI (regola del primo appuntamento).
 *
 * Regola (spec §Decisioni 4): un lead conta UNA SOLA VOLTA, nel giorno in cui
 * gli è stato fissato il PRIMO appuntamento. L'ancora è `Appointment.createdAt`
 * (quando è stato fissato), non `startAt` (quando si tiene): la tabella misura
 * l'attività di chat, non il carico dell'agenda. Senza la regola del primo
 * appuntamento il tasso "risposte → appuntamenti" potrebbe superare il 100%.
 *
 * Due query, entrambe DB-side:
 *  1. `groupBy(leadId)` con `_min(createdAt)` sugli appuntamenti dei lead della
 *     provenienza collegata, limitato a `createdAt < lt` (un lead il cui primo
 *     appuntamento cade dopo la fine del mese non può rientrare). Restituisce
 *     UNA riga per lead con appuntamenti, non una per appuntamento.
 *  2. `findMany` sui soli lead superstiti per leggerne canale e origine.
 */
export async function attributeAppointments(
  deps: InsightDeps,
  config: InsightConfig,
  month: MonthInput,
): Promise<{ attributed: AttributedLead[]; unattributedLeadCount: number }> {
  const monthBounds = periodRange(month.year, month.month);

  const firstAppointmentPerLead = await deps.prisma.appointment.groupBy({
    by: ["leadId"],
    where: {
      createdAt: { lt: monthBounds.lt },
      lead: { is: { sourceId: config.sourceId } },
    },
    _min: { createdAt: true },
  });

  const leadsBookedThisMonth = firstAppointmentPerLead.flatMap((row) => {
    const firstBookedAt = row._min.createdAt;
    if (row.leadId === null || firstBookedAt === null || firstBookedAt < monthBounds.gte) {
      return [];
    }
    return [{ leadId: row.leadId, bookedAt: firstBookedAt }];
  });

  if (leadsBookedThisMonth.length === 0) {
    return { attributed: [], unattributedLeadCount: 0 };
  }

  const leads = await deps.prisma.lead.findMany({
    where: { id: { in: leadsBookedThisMonth.map((entry) => entry.leadId) } },
    select: { id: true, chatChannel: true, createdFromInsight: true },
  });
  const leadById = new Map(leads.map((lead) => [lead.id, lead]));

  const attributed: AttributedLead[] = [];
  let unattributedLeadCount = 0;

  for (const { leadId, bookedAt } of leadsBookedThisMonth) {
    const lead = leadById.get(leadId);
    if (!lead) {
      continue; // lead soft-deleted: il client tenant lo filtra già.
    }
    if (!lead.chatChannel) {
      unattributedLeadCount += 1;
      continue;
    }

    attributed.push({
      leadId,
      dayKey: utcDayKey(bookedAt),
      group: channelGroupOf(lead.chatChannel),
      createdFromInsight: lead.createdFromInsight,
    });
  }

  return { attributed, unattributedLeadCount };
}
