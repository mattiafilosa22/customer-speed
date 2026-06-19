"use client";

import { useActionState, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { AppointmentStatus } from "@/generated/prisma/enums";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  Modal,
  OverflowTrigger,
} from "@/components/ui";
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

/**
 * The primary, contextual status action as one inline form ("✓ Fatto" when the
 * appointment is not done, "Riapri" when it is). The other status change
 * (Annulla) lives in the overflow menu, so the row keeps a single primary
 * control plus "⋯".
 */
function PrimaryStatusButton({
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

/**
 * Per-row actions for an appointment (docs/02 §2.6, audit P1.1):
 *  - ONE inline primary contextual action ("✓ Fatto" / "Riapri").
 *  - everything else behind a compact "⋯" overflow menu: "Annulla" (a submitted
 *    status change), "Modifica" (opens the edit dialog) and "Elimina" as a
 *    `danger` item that opens a confirm Modal — the single app-wide destructive
 *    pattern (danger text in a menu + a confirm dialog).
 *
 * Each control is keyboard reachable with no colour-only meaning. The status
 * changes and delete reuse the existing Server Actions (no duplicated logic).
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
  const tm = useMessage();
  const locale = useLocale();

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteState, deleteFormAction] = useActionState(deleteAppointmentAction, initialState);
  const [seenStatus, setSeenStatus] = useState(deleteState.status);
  if (seenStatus !== deleteState.status) {
    setSeenStatus(deleteState.status);
    if (deleteState.status === "success") setDeleteOpen(false);
  }

  // "Annulla" status-change is a real form submitted from the menu item.
  const cancelFormRef = useRef<HTMLFormElement>(null);
  const [, cancelFormAction] = useActionState(changeAppointmentStatusAction, initialState);

  const isDone = appointment.status === AppointmentStatus.DONE;
  const canCancel = appointment.status !== AppointmentStatus.CANCELED;

  return (
    <div className="flex flex-wrap items-center justify-end gap-1">
      {isDone ? (
        <PrimaryStatusButton
          appointmentId={appointment.id}
          status={AppointmentStatus.PENDING}
          label={t("row.reopen")}
          pendingLabel={t("form.saving")}
        />
      ) : (
        <PrimaryStatusButton
          appointmentId={appointment.id}
          status={AppointmentStatus.DONE}
          label={t("row.markDone")}
          pendingLabel={t("form.saving")}
        />
      )}

      {/* Hidden "Annulla" form, submitted by the menu item below. */}
      {canCancel ? (
        <form ref={cancelFormRef} action={cancelFormAction} className="hidden">
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="appointmentId" value={appointment.id} />
          <input type="hidden" name="status" value={AppointmentStatus.CANCELED} />
        </form>
      ) : null}

      <DropdownMenu>
        <OverflowTrigger size="sm" label={t("row.menuLabel")} />
        <DropdownMenuContent>
          {canCancel ? (
            <DropdownMenuItem onSelect={() => cancelFormRef.current?.requestSubmit()}>
              {t("row.cancel")}
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem onSelect={() => setEditOpen(true)}>{t("row.edit")}</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="danger" onSelect={() => setDeleteOpen(true)}>
            {t("row.delete")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Edit dialog, controlled by the "Modifica" menu item. */}
      <AppointmentDialog
        leads={leads}
        appointment={appointment}
        lockedLeadId={lockLeadId}
        open={editOpen}
        onOpenChange={setEditOpen}
      />

      {/* Delete-confirm dialog (same action as before). */}
      <Modal
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={t("delete.confirmTitle")}
        description={t("delete.confirmBody")}
      >
        <form action={deleteFormAction} noValidate className="flex flex-col gap-4">
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="appointmentId" value={appointment.id} />
          {deleteState.status === "error" && deleteState.formError ? (
            <FormAlert tone="error">{tm(deleteState.formError)}</FormAlert>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <SubmitButton variant="danger" pendingLabel={t("form.saving")} className="w-auto">
              {t("delete.confirm")}
            </SubmitButton>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)}>
              {t("delete.cancel")}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
