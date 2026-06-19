"use client";

import { useActionState, useState, type ChangeEvent } from "react";
import { useLocale, useTranslations } from "next-intl";

import type { ReferenceItem } from "@/server/leads";
import { Button, Modal, Select } from "@/components/ui";
import { LeadStage } from "@/generated/prisma/enums";
import { useLeadStageLabel } from "@/i18n/enum-labels";
import { changeStageAction } from "@/app/[locale]/(app)/leads/actions";
import { type ActionState } from "@/server/actions/action-result";
import { FormAlert } from "@/components/auth/form-alert";
import { SubmitButton } from "@/components/auth/submit-button";
import { useMessage } from "@/components/auth/use-message";

const initialState: ActionState = { status: "idle" };
const STAGE_VALUES = Object.values(LeadStage);

/**
 * "Aggiorna stage" dialog (docs/02 §2.4). Picks the destination stage; when
 * LOST is chosen a required loss-reason Select is revealed. The server still
 * enforces the LOST→reason rule and returns a `lossReasonId` field error, wired
 * to that Select's `error`. Closes on success.
 */
export function UpdateStageDialog({
  leadId,
  currentStage,
  lossReasons,
}: {
  leadId: string;
  currentStage: LeadStage;
  lossReasons: readonly ReferenceItem[];
}) {
  const t = useTranslations();
  const tm = useMessage();
  const locale = useLocale();
  const stageLabel = useLeadStageLabel();
  const [open, setOpen] = useState(false);
  const [selectedStage, setSelectedStage] = useState<LeadStage>(currentStage);
  const [state, formAction] = useActionState(changeStageAction, initialState);

  // Close the dialog once the action succeeds. Detect the transition by storing
  // the previously-seen status in state and adjusting during render (React's
  // sanctioned "store info from previous renders" pattern): the update is
  // conditional and converges, so it does not cascade.
  const [seenStatus, setSeenStatus] = useState(state.status);
  if (seenStatus !== state.status) {
    setSeenStatus(state.status);
    if (state.status === "success" && open) setOpen(false);
  }

  const onOpenChange = (next: boolean) => {
    // Reset the local stage selection each time the dialog opens.
    if (next) setSelectedStage(currentStage);
    setOpen(next);
  };

  const onStageChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setSelectedStage(event.currentTarget.value as LeadStage);
  };

  const isLost = selectedStage === LeadStage.LOST;

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={t("leadDetail.updateStage.title")}
      trigger={<Button>{t("leadDetail.updateStage.cta")}</Button>}
    >
      <form action={formAction} noValidate className="flex flex-col gap-4">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="leadId" value={leadId} />

        {state.status === "error" && state.formError ? (
          <FormAlert tone="error">{tm(state.formError)}</FormAlert>
        ) : null}

        <Select
          label={t("leadDetail.updateStage.stageLabel")}
          name="stage"
          defaultValue={currentStage}
          onChange={onStageChange}
        >
          {STAGE_VALUES.map((value) => (
            <option key={value} value={value}>
              {stageLabel(value)}
            </option>
          ))}
        </Select>

        {isLost ? (
          <Select
            label={t("leadDetail.updateStage.lossReasonLabel")}
            name="lossReasonId"
            defaultValue=""
            required
            error={
              state.status === "error" && state.fieldErrors?.lossReasonId
                ? tm(state.fieldErrors.lossReasonId)
                : undefined
            }
          >
            <option value="">{t("leadDetail.updateStage.lossReasonPlaceholder")}</option>
            {lossReasons.map((reason) => (
              <option key={reason.id} value={reason.id}>
                {reason.label}
              </option>
            ))}
          </Select>
        ) : null}

        <SubmitButton pendingLabel={t("leads.saving")}>{t("leads.save")}</SubmitButton>
      </form>
    </Modal>
  );
}
