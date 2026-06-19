import { getTranslations } from "next-intl/server";

import type { AppointmentItem } from "@/server/appointments";
import { Button, Card, CardBody } from "@/components/ui";
import { formatDateTime } from "@/i18n/format";
import { toDatetimeLocalValue } from "@/lib/datetime-local";
import { AppointmentStatusPill } from "@/components/appointments/appointment-status-pill";
import { AppointmentRowActions } from "@/components/appointments/appointment-row-actions";
import { AppointmentDialog } from "@/components/appointments/appointment-dialog";

/**
 * Appointments panel for the lead detail (docs/02 §2.5 right column). Reuses the
 * shared appointment dialog (with the lead LOCKED to this lead) and the per-row
 * actions, so the create/status/edit/delete behaviour is identical to the
 * appointments page. Server Component — renders already-fetched rows for the lead.
 *
 * Only mounted when the tenant has the `appointments` feature AND the role holds
 * `appointment.manage` (the parent gates it; the actions re-check server-side).
 */
export async function AppointmentsPanel({
  leadId,
  appointments,
}: {
  leadId: string;
  appointments: readonly AppointmentItem[];
}) {
  const t = await getTranslations("appointments");

  return (
    <Card>
      <CardBody className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-ink text-lg">{t("lead.title")}</h2>
          <AppointmentDialog
            leads={[]}
            lockedLeadId={leadId}
            trigger={
              <Button variant="ghost" size="sm">
                {t("lead.add")}
              </Button>
            }
          />
        </div>

        {appointments.length === 0 ? (
          <p className="font-body text-muted text-[13.5px]">{t("lead.empty")}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {appointments.map((appt) => (
              <li
                key={appt.id}
                className="border-line flex flex-col gap-2 border-t pt-3 first:border-t-0 first:pt-0"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-body text-ink text-[13.5px] font-medium">
                    <When startAt={appt.startAt} />
                  </span>
                  <AppointmentStatusPill status={appt.status} />
                </div>
                <span className="font-body text-ink text-[13px]">{appt.reason}</span>
                <AppointmentRowActions
                  appointment={{
                    id: appt.id,
                    startAt: toDatetimeLocalValue(appt.startAt),
                    reason: appt.reason,
                    leadId: appt.leadId,
                    status: appt.status,
                  }}
                  leads={[]}
                  lockLeadId={leadId}
                />
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

/** Localized date + time of an appointment (async SC child). */
async function When({ startAt }: { startAt: Date }) {
  return <>{await formatDateTime(startAt)}</>;
}
