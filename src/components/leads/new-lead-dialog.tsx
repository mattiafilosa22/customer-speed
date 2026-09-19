"use client";

import { useActionState, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import type { ReferenceItem } from "@/server/leads";
import { Button, Input, Modal, Select } from "@/components/ui";
import { CapitalBracket } from "@/generated/prisma/enums";
import { ChatChannel } from "@/generated/prisma/enums";
import { useCapitalBracketLabel, useChatChannelLabel } from "@/i18n/enum-labels";
import { createLeadAction } from "@/app/[locale]/(app)/leads/actions";
import { type ActionState } from "@/server/actions/action-result";
import { FormAlert } from "@/components/auth/form-alert";
import { SubmitButton } from "@/components/auth/submit-button";
import { useMessage } from "@/components/auth/use-message";

const initialState: ActionState = { status: "idle" };
const CAPITAL_VALUES = Object.values(CapitalBracket);
const CHAT_CHANNEL_VALUES = Object.values(ChatChannel);

/**
 * "Nuovo lead" dialog (docs/02 §2.4). Client component: gathers the minimal
 * contact fields + optional source/capital, calls `createLeadAction` via
 * `useActionState`. Closes on success; field/global errors arrive as i18n keys.
 * Validation is server-side (Zod); the UI mirrors it as `aria-describedby`.
 */
export function NewLeadDialog({
  sources,
  insightSourceId = null,
}: {
  sources: readonly ReferenceItem[];
  insightSourceId?: string | null;
}) {
  const t = useTranslations("leads");
  const tm = useMessage();
  const locale = useLocale();
  const capitalLabel = useCapitalBracketLabel();
  const chatChannelLabel = useChatChannelLabel();
  const [open, setOpen] = useState(false);
  const [sourceId, setSourceId] = useState("");
  const [state, formAction] = useActionState(createLeadAction, initialState);

  // Close the dialog on the success transition (React's sanctioned render-time
  // "adjust state from a previous render" pattern — no setState-in-effect).
  const [seenStatus, setSeenStatus] = useState(state.status);
  if (seenStatus !== state.status) {
    setSeenStatus(state.status);
    if (state.status === "success") setOpen(false);
  }

  const isError = state.status === "error";
  const fieldError = (name: string): string | undefined =>
    isError && state.fieldErrors?.[name] ? tm(state.fieldErrors[name]) : undefined;

  return (
    <Modal
      open={open}
      onOpenChange={setOpen}
      title={t("new.title")}
      description={t("new.description")}
      trigger={<Button>{t("new.cta")}</Button>}
    >
      <form action={formAction} noValidate className="flex flex-col gap-4">
        <input type="hidden" name="locale" value={locale} />

        {isError && state.formError ? (
          <FormAlert tone="error">{tm(state.formError)}</FormAlert>
        ) : null}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label={t("fields.firstName")}
            name="firstName"
            required
            error={fieldError("firstName")}
          />
          <Input
            label={t("fields.lastName")}
            name="lastName"
            required
            error={fieldError("lastName")}
          />
        </div>
        <Input label={t("fields.email")} name="email" type="email" error={fieldError("email")} />
        <Input label={t("fields.phone")} name="phone" type="tel" error={fieldError("phone")} />

        <Select
          label={t("fields.source")}
          name="sourceId"
          value={sourceId}
          onChange={(event) => setSourceId(event.target.value)}
        >
          <option value="">{t("filters.allSources")}</option>
          {sources.map((source) => (
            <option key={source.id} value={source.id}>
              {source.label}
            </option>
          ))}
        </Select>

        {insightSourceId !== null && sourceId === insightSourceId ? (
          <Select
            label={t("fields.chatChannel")}
            name="chatChannel"
            defaultValue=""
            required
            error={fieldError("chatChannel")}
          >
            <option value="">—</option>
            {CHAT_CHANNEL_VALUES.map((value) => (
              <option key={value} value={value}>
                {chatChannelLabel(value)}
              </option>
            ))}
          </Select>
        ) : null}

        <Select label={t("fields.capital")} name="capitalBracket" defaultValue="">
          <option value="">—</option>
          {CAPITAL_VALUES.map((value) => (
            <option key={value} value={value}>
              {capitalLabel(value)}
            </option>
          ))}
        </Select>

        <SubmitButton pendingLabel={t("create.submitting")}>{t("create.submit")}</SubmitButton>
      </form>
    </Modal>
  );
}
