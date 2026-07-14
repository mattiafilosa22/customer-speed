"use client";

import { useActionState, useState, type ChangeEvent, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";

import type { ReferenceItem } from "@/server/leads";
import { Button, Input, Modal, Select } from "@/components/ui";
import { LeadStage } from "@/generated/prisma/enums";
import { useLeadStageLabel } from "@/i18n/enum-labels";
import { changeStageAction } from "@/app/[locale]/(app)/leads/actions";
import { type ActionState } from "@/server/actions/action-result";
import { FormAlert } from "@/components/auth/form-alert";
import { SubmitButton } from "@/components/auth/submit-button";
import { useMessage } from "@/components/auth/use-message";

const initialState: ActionState = { status: "idle" };
const STAGE_VALUES = Object.values(LeadStage);
/** Sentinel Select value for "Altro" (free-text loss reason), never sent as-is. */
const OTHER_REASON_VALUE = "__other__";

/**
 * "Aggiorna stage" dialog (docs/02 §2.4). Picks the destination stage; when
 * LOST is chosen a required loss-reason Select is revealed, with an "Altro"
 * option that swaps it for a free-text Input (`lossReasonCustomText`) — the two
 * are mutually exclusive, mirrored server-side (`changeStageSchema`). The
 * server still enforces the LOST→reason rule and returns a `lossReasonId`
 * field error, wired to whichever control is shown. Closes on success.
 *
 * The free-text field is ALSO validated client-side before submit (mirroring
 * `LossReasonDialog`): a whitespace-only value never reaches the server —
 * `onSubmit` reads the live `FormData` and blocks the action, showing an
 * inline error, so the user always gets visible feedback. A `lossReasonCustomText`
 * server field error (e.g. from the REST route, which does not pre-trim like
 * the Server Action's `str()` helper) is wired too, as defense in depth.
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
  const [reasonId, setReasonId] = useState("");
  // Set when a client-side submit attempt found the "Altro" free-text field
  // blank/whitespace-only; cleared as soon as the user edits it or changes
  // stage/reason.
  const [customTextEmpty, setCustomTextEmpty] = useState(false);
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
    if (next) {
      setSelectedStage(currentStage);
      setReasonId("");
      setCustomTextEmpty(false);
    }
    setOpen(next);
  };

  const onStageChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setSelectedStage(event.currentTarget.value as LeadStage);
    setReasonId("");
    setCustomTextEmpty(false);
  };

  const onReasonChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setReasonId(event.currentTarget.value);
    setCustomTextEmpty(false);
  };

  const isLost = selectedStage === LeadStage.LOST;
  const isOtherReason = reasonId === OTHER_REASON_VALUE;

  // Client-side guard (mirrors `LossReasonDialog`'s `!customText.trim()`
  // check): a whitespace-only "Altro" text must never reach the server, where
  // it would otherwise fail silently from the user's point of view.
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    if (isLost && isOtherReason) {
      const value = new FormData(event.currentTarget).get("lossReasonCustomText");
      if (typeof value !== "string" || value.trim() === "") {
        event.preventDefault();
        setCustomTextEmpty(true);
        return;
      }
    }
    setCustomTextEmpty(false);
  };

  const reasonError =
    state.status === "error" && state.fieldErrors?.lossReasonId
      ? tm(state.fieldErrors.lossReasonId)
      : undefined;
  const customTextServerError =
    state.status === "error" && state.fieldErrors?.lossReasonCustomText
      ? tm(state.fieldErrors.lossReasonCustomText)
      : undefined;
  const customTextError = customTextEmpty
    ? t("leadDetail.updateStage.lossReasonCustomRequired")
    : (customTextServerError ?? reasonError);

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={t("leadDetail.updateStage.title")}
      trigger={<Button>{t("leadDetail.updateStage.cta")}</Button>}
    >
      <form action={formAction} onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
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
            // Only submit as `lossReasonId` when a real reason is picked — the
            // "Altro" sentinel must never reach the server as an id.
            name={isOtherReason ? undefined : "lossReasonId"}
            value={reasonId}
            onChange={onReasonChange}
            required
            error={isOtherReason ? undefined : reasonError}
          >
            <option value="">{t("leadDetail.updateStage.lossReasonPlaceholder")}</option>
            {lossReasons.map((reason) => (
              <option key={reason.id} value={reason.id}>
                {reason.label}
              </option>
            ))}
            <option value={OTHER_REASON_VALUE}>{t("leadDetail.updateStage.lossReasonOther")}</option>
          </Select>
        ) : null}

        {isLost && isOtherReason ? (
          <Input
            label={t("leadDetail.updateStage.lossReasonCustomLabel")}
            name="lossReasonCustomText"
            placeholder={t("leadDetail.updateStage.lossReasonCustomPlaceholder")}
            required
            maxLength={500}
            error={customTextError}
            onChange={() => {
              if (customTextEmpty) setCustomTextEmpty(false);
            }}
          />
        ) : null}

        <SubmitButton pendingLabel={t("leads.saving")}>{t("leads.save")}</SubmitButton>
      </form>
    </Modal>
  );
}
