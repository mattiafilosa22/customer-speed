"use client";

import { useActionState, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { ChatChannel } from "@/generated/prisma/enums";
import { useChatChannelLabel } from "@/i18n/enum-labels";
import { createLeadFromCellAction } from "@/app/[locale]/(app)/insight/actions";
import type { ActionState } from "@/server/actions/action-result";
import { Button, Input, Modal, Textarea } from "@/components/ui";
import { FormAlert } from "@/components/auth/form-alert";
import { SubmitButton } from "@/components/auth/submit-button";
import { useMessage } from "@/components/auth/use-message";

const initialState: ActionState = { status: "idle" };
const DEFAULT_TIME = "09:00";

export function NewLeadFromCellDialog({
  date,
  channel,
  sourceLabel,
  open,
  onOpenChange,
}: {
  date: string;
  channel: ChatChannel;
  sourceLabel: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("insight.newLead");
  const translateMessage = useMessage();
  const channelLabel = useChatChannelLabel();
  const [state, formAction] = useActionState(createLeadFromCellAction, initialState);
  const [seenStatus, setSeenStatus] = useState(state.status);
  if (seenStatus !== state.status) {
    setSeenStatus(state.status);
    if (state.status === "success") onOpenChange(false);
  }
  const fieldError = (field: string) =>
    state.status === "error" && state.fieldErrors?.[field]
      ? translateMessage(state.fieldErrors[field])
      : undefined;

  // The cell's day only PRE-FILLS the appointment date: the day a lead is
  // logged is almost never the day of the appointment, so both date and time
  // are editable. Same uncontrolled date + time pattern as
  // `appointment-dialog.tsx` (native inputs fight a controlled `value`), with
  // the hidden `appointmentAt` the Server Action reads kept in sync via refs.
  const dateInputRef = useRef<HTMLInputElement>(null);
  const timeInputRef = useRef<HTMLInputElement>(null);
  const appointmentAtRef = useRef<HTMLInputElement>(null);
  const syncAppointmentAt = () => {
    if (!appointmentAtRef.current) return;
    const day = dateInputRef.current?.value ?? "";
    const time = timeInputRef.current?.value ?? "";
    appointmentAtRef.current.value = `${day}T${time}`;
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={t("title")}
      description={t("description")}
    >
      <form action={formAction} noValidate className="flex flex-col gap-4">
        <input type="hidden" name="chatChannel" value={channel} />
        <input
          ref={appointmentAtRef}
          type="hidden"
          name="appointmentAt"
          defaultValue={`${date}T${DEFAULT_TIME}`}
        />
        {state.status === "error" && state.formError ? (
          <FormAlert tone="error">{translateMessage(state.formError)}</FormAlert>
        ) : null}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <span className="font-body text-xs text-muted">{t("source")}</span>
            <p className="font-body text-sm text-ink">{sourceLabel}</p>
          </div>
          <div>
            <span className="font-body text-xs text-muted">{t("channel")}</span>
            <p className="font-body text-sm text-ink">{channelLabel(channel)}</p>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input label={t("firstName")} name="firstName" required error={fieldError("firstName")} />
          <Input label={t("lastName")} name="lastName" required error={fieldError("lastName")} />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input label={t("email")} name="email" type="email" error={fieldError("email")} />
          <Input label={t("phone")} name="phone" type="tel" error={fieldError("phone")} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input
            ref={dateInputRef}
            label={t("date")}
            type="date"
            required
            defaultValue={date}
            onChange={syncAppointmentAt}
            error={fieldError("appointmentAt")}
          />
          <Input
            ref={timeInputRef}
            label={t("time")}
            type="time"
            required
            defaultValue={DEFAULT_TIME}
            onChange={syncAppointmentAt}
          />
        </div>
        <Textarea
          label={t("reason")}
          name="reason"
          defaultValue={t("reasonDefault")}
          required
          error={fieldError("reason")}
        />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>{t("cancel")}</Button>
          <SubmitButton pendingLabel={t("save")}>{t("save")}</SubmitButton>
        </div>
      </form>
    </Modal>
  );
}
