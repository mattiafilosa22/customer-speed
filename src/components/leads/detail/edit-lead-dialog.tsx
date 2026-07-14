"use client";

import { useActionState, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { Button, Input, Modal } from "@/components/ui";
import { updateLeadAction } from "@/app/[locale]/(app)/leads/actions";
import { type ActionState } from "@/server/actions/action-result";
import { FormAlert } from "@/components/auth/form-alert";
import { SubmitButton } from "@/components/auth/submit-button";
import { useMessage } from "@/components/auth/use-message";

const initialState: ActionState = { status: "idle" };

/**
 * "Modifica lead" dialog (docs/02 §2.5). Same skeleton as `NewLeadDialog`, but
 * precompiled with the lead's current contact fields and submitting via the
 * existing generic `updateLeadAction` (capability `lead.update`, re-checked
 * server-side — the caller renders this component only when `canUpdate`).
 * Closes on success; field/global errors arrive as i18n keys. The trigger uses
 * the `ghost` variant so the header keeps a single filled primary button
 * ("Aggiorna stage", see `LeadOverflowActions`).
 */
export function EditLeadDialog({
  leadId,
  firstName,
  lastName,
  email,
  phone,
}: {
  leadId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
}) {
  const t = useTranslations();
  const tm = useMessage();
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(updateLeadAction, initialState);

  // Close the dialog on the success transition (same render-time "adjust state
  // from a previous render" pattern as `NewLeadDialog`/`UpdateStageDialog`).
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
      title={t("leadDetail.edit.title")}
      trigger={<Button variant="ghost">{t("leadDetail.edit.cta")}</Button>}
    >
      <form action={formAction} noValidate className="flex flex-col gap-4">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="leadId" value={leadId} />

        {isError && state.formError ? (
          <FormAlert tone="error">{tm(state.formError)}</FormAlert>
        ) : null}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label={t("leads.fields.firstName")}
            name="firstName"
            required
            defaultValue={firstName}
            error={fieldError("firstName")}
          />
          <Input
            label={t("leads.fields.lastName")}
            name="lastName"
            required
            defaultValue={lastName}
            error={fieldError("lastName")}
          />
        </div>
        <Input
          label={t("leads.fields.email")}
          name="email"
          type="email"
          defaultValue={email ?? ""}
          error={fieldError("email")}
        />
        <Input
          label={t("leads.fields.phone")}
          name="phone"
          type="tel"
          defaultValue={phone ?? ""}
          error={fieldError("phone")}
        />

        <div className="flex flex-wrap gap-2">
          <SubmitButton pendingLabel={t("leads.saving")} className="w-auto">
            {t("leads.save")}
          </SubmitButton>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            {t("leads.cancel")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
