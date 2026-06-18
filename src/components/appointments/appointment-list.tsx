import { getTranslations } from "next-intl/server";

import type { AppointmentItem } from "@/server/appointments";
import { Card } from "@/components/ui";
import { Link } from "@/i18n/navigation";
import { formatDateTime } from "@/i18n/format";
import { toDatetimeLocalValue } from "@/lib/datetime-local";
import { AppointmentStatusPill } from "@/components/appointments/appointment-status-pill";
import { AppointmentRowActions } from "@/components/appointments/appointment-row-actions";
import type { LeadOption } from "@/components/appointments/appointment-dialog";

/**
 * Responsive appointment list (docs/05 §5.7/§5.8: real table on >=md, card list
 * on mobile). Server Component — renders the already-fetched, paginated rows. The
 * status is shown as a pill carrying TEXT + tone (not colour alone, WCAG 1.4.1);
 * the per-row actions (done/edit/delete) are an interactive client island.
 *
 * The localized date/time come from the i18n formatters; the edit dialog's
 * `datetime-local` default is computed in the app time zone via
 * `toDatetimeLocalValue`.
 */
export async function AppointmentList({
  appointments,
  leads,
}: {
  appointments: readonly AppointmentItem[];
  leads: readonly LeadOption[];
}) {
  const t = await getTranslations("appointments");

  const dialogValues = (appt: AppointmentItem) => ({
    id: appt.id,
    startAt: toDatetimeLocalValue(appt.startAt),
    reason: appt.reason,
    leadId: appt.leadId,
    status: appt.status,
  });

  const leadName = (appt: AppointmentItem): string | null =>
    appt.lead ? `${appt.lead.firstName} ${appt.lead.lastName}` : null;

  return (
    <>
      {/* Desktop / tablet: real table with a header row. */}
      <Card className="hidden overflow-hidden md:block">
        <table className="w-full border-collapse">
          <caption className="sr-only">{t("title")}</caption>
          <thead>
            <tr className="border-line border-b text-left">
              <th scope="col" className="label-mono text-muted px-4 py-3">
                {t("table.date")}
              </th>
              <th scope="col" className="label-mono text-muted px-4 py-3">
                {t("table.reason")}
              </th>
              <th scope="col" className="label-mono text-muted px-4 py-3">
                {t("table.lead")}
              </th>
              <th scope="col" className="label-mono text-muted px-4 py-3">
                {t("table.status")}
              </th>
              <th scope="col" className="px-4 py-3 text-right">
                <span className="sr-only">{t("table.actions")}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {appointments.map((appt) => (
              <tr
                key={appt.id}
                className="border-line2 border-b last:border-0 align-top"
              >
                <th scope="row" className="px-4 py-3 text-left font-normal">
                  <span className="font-body text-ink text-[13.5px]">
                    {/* formatDateTime + formatDateShort are async SC children */}
                    <AppointmentWhen startAt={appt.startAt} />
                  </span>
                </th>
                <td className="font-body text-ink px-4 py-3 text-[13.5px]">{appt.reason}</td>
                <td className="font-body text-muted px-4 py-3 text-[13px]">
                  {appt.lead ? (
                    <Link
                      href={`/leads/${appt.lead.id}`}
                      className="text-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      {leadName(appt)}
                    </Link>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-3">
                  <AppointmentStatusPill status={appt.status} />
                </td>
                <td className="px-4 py-3">
                  <AppointmentRowActions appointment={dialogValues(appt)} leads={leads} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/* Mobile: card list (one card per appointment). */}
      <ul className="flex flex-col gap-3 md:hidden">
        {appointments.map((appt) => (
          <li key={appt.id}>
            <Card>
              <div className="flex flex-col gap-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-body text-ink text-[13.5px] font-medium">
                    <AppointmentWhen startAt={appt.startAt} />
                  </span>
                  <AppointmentStatusPill status={appt.status} />
                </div>
                <span className="font-body text-ink text-[13.5px]">{appt.reason}</span>
                {appt.lead ? (
                  <Link
                    href={`/leads/${appt.lead.id}`}
                    className="font-body text-accent text-[13px] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    {leadName(appt)}
                  </Link>
                ) : null}
                <AppointmentRowActions appointment={dialogValues(appt)} leads={leads} />
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </>
  );
}

/** Localized date + time of an appointment (async SC). */
async function AppointmentWhen({ startAt }: { startAt: Date }) {
  return <>{await formatDateTime(startAt)}</>;
}
