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
 * mirroring the Fase-2 detail dialog `UpdateStageDialog` — SAME validation
 * pattern, so a user who encounters both dialogs gets a consistent experience:
 * a missing reason / a blank "Altro" text is a FIELD-level error tied to the
 * Select/Input via `aria-describedby` (not a generic banner), and each error
 * describes the actual problem (WCAG 3.3.1) — "select a reason" only when no
 * reason at all was picked, "enter the text" only when "Altro" was picked but
 * left blank. A reason is REQUIRED (the server enforces it too): either a
 * reason from the list, or free text via "Altro" (mutually exclusive —
 * `changeStageSchema`). On confirm it performs the optimistic move; a
 * network/generic failure from that call is a SEPARATE top-of-dialog
 * `FormAlert` (kept apart from the two field errors, same split as
 * `UpdateStageDialog`'s `formError` vs `fieldErrors`).
 *
 * `open`/`onOpenChange` are OWNED BY THE CALLER (unlike `UpdateStageDialog`,
 * which owns its own `open`): `move-stage-menu.tsx` keeps this dialog mounted
 * for the whole card lifetime, only toggling `open` — so ALL local state
 * (selection + both field errors + any action error) is reset on every
 * false→true transition, not just after a successful confirm. Without this, a
 * stale error/selection from a cancelled attempt would resurface the next
 * time the same card's dialog opens. Adjust-during-render (React's sanctioned
 * "reset state on prop change" pattern), same technique `Modal` itself uses
 * for its opener tracking.
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
  const [reasonMissing, setReasonMissing] = useState(false);
  const [customTextEmpty, setCustomTextEmpty] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const isOtherReason = reasonId === OTHER_REASON_VALUE;

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setReasonId("");
      setCustomText("");
      setReasonMissing(false);
      setCustomTextEmpty(false);
      setActionError(null);
    }
  }

  const onReasonChange = (value: string) => {
    setReasonId(value);
    setReasonMissing(false);
    setCustomTextEmpty(false);
  };

  const onCustomTextChange = (value: string) => {
    setCustomText(value);
    if (customTextEmpty) setCustomTextEmpty(false);
  };

  const confirm = async () => {
    if (!reasonId) {
      setReasonMissing(true);
      return;
    }
    if (isOtherReason && !customText.trim()) {
      setCustomTextEmpty(true);
      return;
    }
    setPending(true);
    setActionError(null);
    try {
      await moveLead(
        isOtherReason
          ? { leadId, stage: LeadStage.LOST, lossReasonCustomText: customText.trim() }
          : { leadId, stage: LeadStage.LOST, lossReasonId: reasonId },
      );
      onOpenChange(false);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "pipeline.errors.generic");
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal open={open} onOpenChange={onOpenChange} title={t("pipeline.lossReason.title")}>
      <div className="flex flex-col gap-4">
        {actionError ? <FormAlert tone="error">{tm(actionError)}</FormAlert> : null}

        <Select
          label={t("pipeline.lossReason.label")}
          value={reasonId}
          required
          onChange={(e) => onReasonChange(e.currentTarget.value)}
          error={reasonMissing ? t("pipeline.errors.lossReasonRequired") : undefined}
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
            onChange={(e) => onCustomTextChange(e.currentTarget.value)}
            error={customTextEmpty ? t("pipeline.lossReason.customRequired") : undefined}
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
