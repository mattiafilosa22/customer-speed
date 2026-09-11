"use client";

import { useActionState, useState } from "react";
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
  const [time, setTime] = useState("09:00");
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

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={t("title")}
      description={t("description")}
    >
      <form action={formAction} noValidate className="flex flex-col gap-4">
        <input type="hidden" name="chatChannel" value={channel} />
        <input type="hidden" name="appointmentAt" value={`${date}T${time}:00`} />
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
          <Input label={t("date")} value={date} readOnly />
          <Input
            label={t("time")}
            type="time"
            value={time}
            onChange={(event) => setTime(event.target.value)}
            error={fieldError("appointmentAt")}
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
