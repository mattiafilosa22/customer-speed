"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { LeadStage } from "@/generated/prisma/enums";
import { Button, Input, Modal, Select } from "@/components/ui";
import { FormAlert } from "@/components/auth/form-alert";
import { useMessage } from "@/components/auth/use-message";
import { useBoard } from "@/components/pipeline/board-context";

/** Sentinel Select value for "Altro" (free-text loss reason), never sent as-is. */
const OTHER_REASON_VALUE = "__other__";

/**
 * Loss-reason dialog (docs/02 §2.5) — reused by the board whenever a lead is
 * moved to LOST (both via drag&drop and via the keyboard "Sposta in…" menu),
 * mirroring the Fase-2 detail dialog. A reason is REQUIRED (the server enforces
 * it too): either a reason from the list, or free text via the "Altro" option
 * (mutually exclusive — `changeStageSchema`). On confirm it performs the
 * optimistic move; it stays open and shows a localized error if the move fails.
 */
export function LossReasonDialog({
  leadId,
  open,
  onOpenChange,
}: {
  leadId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations();
  const tm = useMessage();
  const { moveLead, lossReasons } = useBoard();
  const [reasonId, setReasonId] = useState("");
  const [customText, setCustomText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const isOtherReason = reasonId === OTHER_REASON_VALUE;

  const reset = () => {
    setReasonId("");
    setCustomText("");
  };

  const confirm = async () => {
    if (!reasonId || (isOtherReason && !customText.trim())) {
      setError("pipeline.errors.lossReasonRequired");
      return;
    }
    setPending(true);
    setError(null);
    try {
      await moveLead(
        isOtherReason
          ? { leadId, stage: LeadStage.LOST, lossReasonCustomText: customText.trim() }
          : { leadId, stage: LeadStage.LOST, lossReasonId: reasonId },
      );
      onOpenChange(false);
      reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : "pipeline.errors.generic");
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal open={open} onOpenChange={onOpenChange} title={t("pipeline.lossReason.title")}>
      <div className="flex flex-col gap-4">
        {error ? <FormAlert tone="error">{tm(error)}</FormAlert> : null}

        <Select
          label={t("pipeline.lossReason.label")}
          value={reasonId}
          required
          onChange={(e) => setReasonId(e.currentTarget.value)}
        >
          <option value="">{t("pipeline.lossReason.placeholder")}</option>
          {lossReasons.map((reason) => (
            <option key={reason.id} value={reason.id}>
              {reason.label}
            </option>
          ))}
          <option value={OTHER_REASON_VALUE}>{t("pipeline.lossReason.other")}</option>
        </Select>

        {isOtherReason ? (
          <Input
            label={t("pipeline.lossReason.customLabel")}
            placeholder={t("pipeline.lossReason.customPlaceholder")}
            required
            maxLength={500}
            value={customText}
            onChange={(e) => setCustomText(e.currentTarget.value)}
          />
        ) : null}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" type="button" onClick={() => onOpenChange(false)}>
            {t("leads.cancel")}
          </Button>
          <Button type="button" onClick={confirm} disabled={pending}>
            {pending ? t("leads.saving") : t("leads.save")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
