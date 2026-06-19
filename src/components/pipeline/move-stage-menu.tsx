"use client";

import { useState, type ChangeEvent } from "react";
import { useTranslations } from "next-intl";

import { LeadStage } from "@/generated/prisma/enums";
import { Select } from "@/components/ui";
import { useBoard } from "@/components/pipeline/board-context";
import { LossReasonDialog } from "@/components/pipeline/loss-reason-dialog";

export interface StageOption {
  readonly stage: LeadStage;
  readonly label: string;
}

/**
 * Keyboard-accessible ALTERNATIVE to drag&drop (docs/02 §2.3, docs/05 §5.6 —
 * VINCOLANTE: the DnD must never be the only way to change stage).
 *
 * A native, fully labelled `<select>` ("Sposta in…") lists the destination
 * stages; choosing one triggers the same optimistic `moveLead` the drag uses.
 * Choosing LOST opens the loss-reason dialog first (a reason is required). After
 * a successful move the board's ARIA live region announces it (handled in
 * `moveLead`). The select resets to its placeholder so it always reads "move to".
 */
export function MoveStageMenu({
  leadId,
  currentStage,
  stageOptions,
}: {
  leadId: string;
  currentStage: LeadStage;
  stageOptions: readonly StageOption[];
}) {
  const t = useTranslations();
  const { moveLead } = useBoard();
  const [lossOpen, setLossOpen] = useState(false);
  const [value, setValue] = useState("");

  const onChange = async (event: ChangeEvent<HTMLSelectElement>) => {
    const target = event.currentTarget.value as LeadStage | "";
    if (!target || target === currentStage) {
      setValue("");
      return;
    }
    if (target === LeadStage.LOST) {
      setLossOpen(true);
      setValue("");
      return;
    }
    // Optimistic move; reset the control regardless of outcome (the live region
    // / a rollback communicates the result).
    setValue("");
    await moveLead({ leadId, stage: target }).catch(() => {
      /* rollback + announcement handled centrally in moveLead */
    });
  };

  return (
    <>
      <Select
        label={t("pipeline.moveMenu.label")}
        hideLabel
        value={value}
        onChange={onChange}
        className="max-w-[150px]"
      >
        <option value="">{t("pipeline.moveMenu.placeholder")}</option>
        {stageOptions
          .filter((option) => option.stage !== currentStage)
          .map((option) => (
            <option key={option.stage} value={option.stage}>
              {option.label}
            </option>
          ))}
      </Select>

      <LossReasonDialog leadId={leadId} open={lossOpen} onOpenChange={setLossOpen} />
    </>
  );
}
