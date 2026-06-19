"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { LeadStage } from "@/generated/prisma/enums";
import { Button, Modal, Select } from "@/components/ui";
import { FormAlert } from "@/components/auth/form-alert";
import { useMessage } from "@/components/auth/use-message";
import { useBoard } from "@/components/pipeline/board-context";

/**
 * Loss-reason dialog (docs/02 §2.5) — reused by the board whenever a lead is
 * moved to LOST (both via drag&drop and via the keyboard "Sposta in…" menu),
 * mirroring the Fase-2 detail dialog. A reason is REQUIRED (the server enforces
 * it too). On confirm it performs the optimistic move; it stays open and shows
 * a localized error if the move fails.
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
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const confirm = async () => {
    if (!reasonId) {
      setError("pipeline.errors.lossReasonRequired");
      return;
    }
    setPending(true);
    setError(null);
    try {
      await moveLead({ leadId, stage: LeadStage.LOST, lossReasonId: reasonId });
      onOpenChange(false);
      setReasonId("");
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
        </Select>

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
