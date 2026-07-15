"use client";

import {
  useActionState,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";
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
  /**
   * Controlled open state — lets a parent (e.g. an overflow menu's "Modifica"
   * item, audit P1.1) drive the dialog without its own trigger button. When
   * provided, the internal trigger is omitted. Uncontrolled (trigger-based)
   * otherwise.
   */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
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
  open: openProp,
  onOpenChange: onOpenChangeProp,
}: AppointmentDialogProps) {
  const t = useTranslations("appointments");
  const tm = useMessage();
  const locale = useLocale();
  const isEdit = appointment !== undefined;
  const action = isEdit ? updateAppointmentAction : createAppointmentAction;

  // Controlled when the parent passes `open`; otherwise self-managed.
  const isControlled = openProp !== undefined;
  const [openInternal, setOpenInternal] = useState(false);
  const open = isControlled ? openProp : openInternal;
  const setOpen = (next: boolean) => {
    if (!isControlled) setOpenInternal(next);
    onOpenChangeProp?.(next);
  };
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

  // The `datetime-local` value (`YYYY-MM-DDTHH:mm`) is edited as two separate
  // native inputs (date + time) so that finishing the date can auto-advance
  // focus to the time field — a single `datetime-local` input exposes no way to
  // jump its internal segments programmatically. Both are UNCONTROLLED
  // (`defaultValue`, not `value`): a native multi-segment date/time input
  // re-rendered with a new `value` prop on every keystroke (React "controlled"
  // style) fights the browser's own per-segment typing buffer and corrupts
  // digits mid-entry (e.g. typing a 4-digit year lands as "0002"). Instead the
  // hidden `startAt` field the Server Action reads is kept in sync imperatively
  // via refs, so the visible inputs are never force-reset while the user types.
  const [defaultDate, defaultTime] = (appointment?.startAt ?? "").split("T");
  const dateInputRef = useRef<HTMLInputElement>(null);
  const timeInputRef = useRef<HTMLInputElement>(null);
  const startAtHiddenRef = useRef<HTMLInputElement>(null);

  const syncStartAtHidden = () => {
    if (!startAtHiddenRef.current) return;
    const date = dateInputRef.current?.value ?? "";
    const time = timeInputRef.current?.value ?? "";
    startAtHiddenRef.current.value = `${date}T${time}`;
  };

  /**
   * Is `value` (the date input's `YYYY-MM-DD`) a REAL, fully-typed date rather
   * than Chromium's odometer-style padding of a still-mid-entry year?
   *
   * Chrome's `type="date"` year sub-field shifts digits in one at a time as you
   * type, and `.value` reports the padded result on every keystroke: typing
   * "2026" one digit at a time yields "0002", "0020", "0202", "2026" in turn —
   * all four are syntactically-complete 10-char date strings. Checking
   * `value.length === 10` alone therefore fires on the FIRST digit, not the
   * last. Appointments are always in the 2000–2100 range (mirrors the server
   * `startAt` schema), so requiring a plausible year filters out every
   * mid-typing intermediate value without needing a debounce/timer.
   */
  const isCompleteDate = (value: string): boolean => {
    if (value.length !== 10) return false;
    const year = Number.parseInt(value.slice(0, 4), 10);
    return year >= 2000 && year <= 2100;
  };

  const onDateChange = (event: ChangeEvent<HTMLInputElement>) => {
    syncStartAtHidden();
    if (isCompleteDate(event.currentTarget.value)) timeInputRef.current?.focus();
  };

  const defaultLeadId = lockedLeadId ?? appointment?.leadId ?? "";
  const showLeadSelect = !lockedLeadId;

  return (
    <Modal
      open={open}
      onOpenChange={setOpen}
      title={isEdit ? t("edit.title") : t("new.title")}
      description={isEdit ? t("edit.description") : t("new.description")}
      trigger={isControlled ? undefined : (trigger ?? <Button>{t("new.cta")}</Button>)}
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

        <input
          ref={startAtHiddenRef}
          type="hidden"
          name="startAt"
          defaultValue={appointment?.startAt ?? ""}
        />
        <div className="flex gap-3">
          <Input
            ref={dateInputRef}
            label={t("form.startAtDate")}
            type="date"
            required
            defaultValue={defaultDate ?? ""}
            onChange={onDateChange}
            error={fieldError("startAt")}
            className="flex-1"
          />
          <Input
            ref={timeInputRef}
            label={t("form.startAtTime")}
            type="time"
            required
            defaultValue={defaultTime ?? ""}
            onChange={syncStartAtHidden}
            className="flex-1"
          />
        </div>
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
