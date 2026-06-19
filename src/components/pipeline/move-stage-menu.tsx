"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { LeadStage } from "@/generated/prisma/enums";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  OverflowTrigger,
} from "@/components/ui";
import { useBoard } from "@/components/pipeline/board-context";
import { LossReasonDialog } from "@/components/pipeline/loss-reason-dialog";

export interface StageOption {
  readonly stage: LeadStage;
  readonly label: string;
}

/**
 * Keyboard-accessible ALTERNATIVE to drag&drop (docs/02 §2.3, docs/05 §5.6 —
 * VINCOLANTE: DnD must never be the only way to change stage).
 *
 * A compact "⋯" overflow menu (audit P0.3) replaces the bulky native select.
 * The trigger keeps the "Sposta in…" accessible name; Radix gives full keyboard
 * navigation + `aria-haspopup="menu"`. Choosing a stage triggers the same
 * optimistic `moveLead` the drag uses; choosing LOST opens the loss-reason
 * dialog first (a reason is required). Successful moves are announced by the
 * board's ARIA live region (handled in `moveLead`).
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

  const onSelectStage = (target: LeadStage) => {
    if (target === currentStage) return;
    if (target === LeadStage.LOST) {
      setLossOpen(true);
      return;
    }
    // Optimistic move; a rollback + announcement is handled centrally in moveLead.
    void moveLead({ leadId, stage: target }).catch(() => {
      /* handled in moveLead */
    });
  };

  const destinations = stageOptions.filter((option) => option.stage !== currentStage);

  return (
    <>
      <DropdownMenu>
        <OverflowTrigger size="sm" label={t("pipeline.moveMenu.label")} />
        <DropdownMenuContent>
          {destinations.map((option) => (
            <DropdownMenuItem
              key={option.stage}
              onSelect={() => onSelectStage(option.stage)}
            >
              {option.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <LossReasonDialog leadId={leadId} open={lossOpen} onOpenChange={setLossOpen} />
    </>
  );
}
