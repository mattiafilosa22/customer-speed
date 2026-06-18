"use client";

import { useActionState, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";

import { Button, Input, Modal, Select } from "@/components/ui";
import {
  createAppointmentAction,
  updateAppointmentAction,
} from "@/app/[locale]/(app)/appointments/actions";
import { type ActionState } from "@/server/actions/action-result";
import { FormAlert } from "@/components/auth/form-alert";
import { SubmitButton } from "@/components/auth/submit-button";
import { useMessage } from "@/components/auth/use-message";

const initialState: ActionState = { status: "idle" };

export interface LeadOption {
  id: string;
  firstName: string;
  lastName: string;
}

export interface AppointmentDialogValues {
  id: string;
  /** `datetime-local` value (`YYYY-MM-DDTHH:mm`), local time. */
  startAt: string;
  reason: string;
  leadId: string | null;
}

interface AppointmentDialogProps {
  /** Lead options for the "lead collegato" select. */
  leads: readonly LeadOption[];
  /** Existing appointment to edit; omit to create a new one. */
  appointment?: AppointmentDialogValues;
  /**
   * Pre-selected & LOCKED lead (the lead-detail panel): the select is hidden and
   * the link is fixed to this lead. Applies to both create and edit, so editing
   * from a lead's detail keeps the appointment attached to that lead.
   */
  lockedLeadId?: string;
  /** Custom trigger (defaults to a primary "Nuovo appuntamento" button). */
  trigger?: ReactNode;
}

/**
 * Create / edit appointment dialog (docs/02 §2.6). Client component: gathers
 * start (datetime), reason and an optional linked lead, then calls the matching
 * Server Action via `useActionState`. Closes on success; field/global errors
 * arrive as i18n keys. Validation is server-side (Zod); the UI mirrors it via
 * `aria-describedby`. Built on the accessible Radix `Modal` (focus trap, ESC).
 */
export function AppointmentDialog({
  leads,
  appointment,
  lockedLeadId,
  trigger,
}: AppointmentDialogProps) {
  const t = useTranslations("appointments");
  const tm = useMessage();
  const locale = useLocale();
  const isEdit = appointment !== undefined;
  const action = isEdit ? updateAppointmentAction : createAppointmentAction;

  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(action, initialState);

  // Close on the success transition (render-time state adjustment — no effect).
  const [seenStatus, setSeenStatus] = useState(state.status);
  if (seenStatus !== state.status) {
    setSeenStatus(state.status);
    if (state.status === "success") setOpen(false);
  }

  const isError = state.status === "error";
  const fieldError = (name: string): string | undefined =>
    isError && state.fieldErrors?.[name] ? tm(state.fieldErrors[name]) : undefined;

  const defaultStart = appointment?.startAt ?? "";
  const defaultLeadId = lockedLeadId ?? appointment?.leadId ?? "";
  const showLeadSelect = !lockedLeadId;

  return (
    <Modal
      open={open}
      onOpenChange={setOpen}
      title={isEdit ? t("edit.title") : t("new.title")}
      description={isEdit ? t("edit.description") : t("new.description")}
      trigger={trigger ?? <Button>{t("new.cta")}</Button>}
    >
      <form action={formAction} noValidate className="flex flex-col gap-4">
        <input type="hidden" name="locale" value={locale} />
        {isEdit ? (
          <input type="hidden" name="appointmentId" value={appointment.id} />
        ) : null}
        {lockedLeadId ? <input type="hidden" name="leadId" value={lockedLeadId} /> : null}

        {isError && state.formError ? (
          <FormAlert tone="error">{tm(state.formError)}</FormAlert>
        ) : null}

        <Input
          label={t("form.startAt")}
          name="startAt"
          type="datetime-local"
          required
          defaultValue={defaultStart}
          error={fieldError("startAt")}
        />
        <Input
          label={t("form.reason")}
          name="reason"
          required
          defaultValue={appointment?.reason ?? ""}
          error={fieldError("reason")}
        />

        {showLeadSelect ? (
          <Select
            label={t("form.lead")}
            name="leadId"
            defaultValue={defaultLeadId}
            error={fieldError("leadId")}
          >
            <option value="">{t("form.noLead")}</option>
            {leads.map((lead) => (
              <option key={lead.id} value={lead.id}>
                {lead.firstName} {lead.lastName}
              </option>
            ))}
          </Select>
        ) : null}

        <SubmitButton pendingLabel={t("form.saving")}>{t("form.submit")}</SubmitButton>
      </form>
    </Modal>
  );
}
