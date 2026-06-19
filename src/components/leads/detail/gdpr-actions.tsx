"use client";

import { useActionState, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";

import { Button, Modal } from "@/components/ui";
import {
  eraseLeadDataAction,
  exportLeadDataAction,
} from "@/app/[locale]/(app)/leads/actions";
import { type ActionState } from "@/server/actions/action-result";
import { FormAlert } from "@/components/auth/form-alert";
import { SubmitButton } from "@/components/auth/submit-button";
import { useMessage } from "@/components/auth/use-message";

const initialState: ActionState = { status: "idle" };

/**
 * GDPR Data Subject Request controls for the lead detail header (docs/06 §6.5):
 *  - "Esporta dati": calls the export action and triggers a client-side JSON
 *    download (no server file storage). Gated server-side by `lead.exportData`.
 *  - "Cancella dati": opens an explicit confirm dialog before the irreversible
 *    erasure/anonymization. Gated server-side by `lead.eraseData`.
 *
 * Both buttons render only when the server passed the matching capability
 * (`canExport`/`canErase`); the Server Actions re-check (UI gating is cosmetic).
 * Accessible: native buttons, focus-managed Radix dialog, status messages with
 * an alert region.
 */
export function GdprActions({
  leadId,
  canExport,
  canErase,
}: {
  leadId: string;
  canExport: boolean;
  canErase: boolean;
}) {
  const t = useTranslations("gdpr");
  const tm = useMessage();
  const locale = useLocale();

  // ── Export: client-triggered download of the returned JSON ──
  const [isExporting, startExport] = useTransition();
  const [exportError, setExportError] = useState<string | null>(null);

  function handleExport() {
    setExportError(null);
    startExport(async () => {
      const result = await exportLeadDataAction(leadId);
      if (result.status === "error") {
        setExportError(result.formError ?? "gdpr.errors.generic");
        return;
      }
      const blob = new Blob([JSON.stringify(result.data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = result.filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    });
  }

  // ── Erasure: confirm dialog ──
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(eraseLeadDataAction, initialState);
  const [seenStatus, setSeenStatus] = useState(state.status);
  if (seenStatus !== state.status) {
    setSeenStatus(state.status);
    if (state.status === "success") setOpen(false);
  }

  if (!canExport && !canErase) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {canExport ? (
        <div className="flex flex-col items-end gap-1">
          <Button variant="ghost" onClick={handleExport} disabled={isExporting}>
            {isExporting ? t("export.pending") : t("export.cta")}
          </Button>
          {exportError ? (
            <span role="alert" className="font-body text-[12px] text-danger-ink">
              {tm(exportError)}
            </span>
          ) : null}
        </div>
      ) : null}

      {canErase ? (
        <Modal
          open={open}
          onOpenChange={setOpen}
          title={t("erase.confirmTitle")}
          description={t("erase.confirmBody")}
          trigger={<Button variant="danger">{t("erase.cta")}</Button>}
        >
          <form action={formAction} noValidate className="flex flex-col gap-4">
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="leadId" value={leadId} />

            {state.status === "error" && state.formError ? (
              <FormAlert tone="error">{tm(state.formError)}</FormAlert>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <SubmitButton variant="danger" pendingLabel={t("erase.pending")} className="w-auto">
                {t("erase.confirm")}
              </SubmitButton>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                {t("erase.cancel")}
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}
