"use client";

import { useActionState, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { AppointmentStatus } from "@/generated/prisma/enums";
import { Button, Modal } from "@/components/ui";
import {
  changeAppointmentStatusAction,
  deleteAppointmentAction,
} from "@/app/[locale]/(app)/appointments/actions";
import { type ActionState } from "@/server/actions/action-result";
import { FormAlert } from "@/components/auth/form-alert";
import { SubmitButton } from "@/components/auth/submit-button";
import { useMessage } from "@/components/auth/use-message";
import {
  AppointmentDialog,
  type AppointmentDialogValues,
  type LeadOption,
} from "@/components/appointments/appointment-dialog";

const initialState: ActionState = { status: "idle" };

/** A single status-change form rendered as one button (PENDING/DONE/CANCELED). */
function StatusButton({
  appointmentId,
  status,
  label,
  pendingLabel,
}: {
  appointmentId: string;
  status: AppointmentStatus;
  label: string;
  pendingLabel: string;
}) {
  const locale = useLocale();
  const [, formAction] = useActionState(changeAppointmentStatusAction, initialState);

  return (
    <form action={formAction}>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="appointmentId" value={appointmentId} />
      <input type="hidden" name="status" value={status} />
      <SubmitButton variant="ghost" size="sm" pendingLabel={pendingLabel} className="w-auto">
        {label}
      </SubmitButton>
    </form>
  );
}

/** Delete-confirm dialog for one appointment. */
function DeleteButton({ appointmentId }: { appointmentId: string }) {
  const t = useTranslations("appointments");
  const tm = useMessage();
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(deleteAppointmentAction, initialState);

  const [seenStatus, setSeenStatus] = useState(state.status);
  if (seenStatus !== state.status) {
    setSeenStatus(state.status);
    if (state.status === "success") setOpen(false);
  }

  return (
    <Modal
      open={open}
      onOpenChange={setOpen}
      title={t("delete.confirmTitle")}
      description={t("delete.confirmBody")}
      trigger={
        <Button variant="ghost" size="sm">
          {t("row.delete")}
        </Button>
      }
    >
      <form action={formAction} noValidate className="flex flex-col gap-4">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="appointmentId" value={appointmentId} />

        {state.status === "error" && state.formError ? (
          <FormAlert tone="error">{tm(state.formError)}</FormAlert>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <SubmitButton pendingLabel={t("form.saving")} className="w-auto">
            {t("delete.confirm")}
          </SubmitButton>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            {t("delete.cancel")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/**
 * Per-row actions for an appointment (docs/02 §2.6): mark "✓ Fatto" (when not
 * already done), reopen / cancel as appropriate, edit (dialog) and delete
 * (confirm). Each control is a labelled button — keyboard reachable, no
 * colour-only meaning. Status changes are individual Server-Action forms.
 */
export function AppointmentRowActions({
  appointment,
  leads,
  lockLeadId,
}: {
  appointment: AppointmentDialogValues & { status: AppointmentStatus };
  leads: readonly LeadOption[];
  /** When set, the edit dialog locks the lead link to this id (lead-detail panel). */
  lockLeadId?: string;
}) {
  const t = useTranslations("appointments");

  return (
    <div className="flex flex-wrap items-center justify-end gap-1">
      {appointment.status !== AppointmentStatus.DONE ? (
        <StatusButton
          appointmentId={appointment.id}
          status={AppointmentStatus.DONE}
          label={t("row.markDone")}
          pendingLabel={t("form.saving")}
        />
      ) : (
        <StatusButton
          appointmentId={appointment.id}
          status={AppointmentStatus.PENDING}
          label={t("row.reopen")}
          pendingLabel={t("form.saving")}
        />
      )}

      {appointment.status !== AppointmentStatus.CANCELED ? (
        <StatusButton
          appointmentId={appointment.id}
          status={AppointmentStatus.CANCELED}
          label={t("row.cancel")}
          pendingLabel={t("form.saving")}
        />
      ) : null}

      <AppointmentDialog
        leads={leads}
        appointment={appointment}
        lockedLeadId={lockLeadId}
        trigger={
          <Button variant="ghost" size="sm">
            {t("row.edit")}
          </Button>
        }
      />

      <DeleteButton appointmentId={appointment.id} />
    </div>
  );
}
