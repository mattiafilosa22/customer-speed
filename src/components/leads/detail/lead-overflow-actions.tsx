"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  Modal,
  OverflowTrigger,
} from "@/components/ui";
import { useRouter } from "@/i18n/navigation";
import {
  deleteLeadAction,
  eraseLeadDataAction,
  exportLeadDataAction,
  exportLeadDataXlsxAction,
} from "@/app/[locale]/(app)/leads/actions";
import { type ActionState } from "@/server/actions/action-result";
import { FormAlert } from "@/components/auth/form-alert";
import { SubmitButton } from "@/components/auth/submit-button";
import { useMessage } from "@/components/auth/use-message";

const initialState: ActionState = { status: "idle" };

/**
 * Overflow ("⋯") menu for the lead-detail header (audit P0.1/P0.2). Collapses
 * every NON-primary action behind a single accessible menu so the header keeps
 * exactly one filled primary button ("Aggiorna stage", rendered by the page):
 *
 *  - "Esporta dati" → a SUBMENU with "Excel (.xlsx)" and "JSON" (both reuse the
 *    existing export Server Actions; the client builds the download Blob).
 *  - a separator, then the DESTRUCTIVE actions "Elimina lead" and "Cancella dati"
 *    as `danger` items (TEXT in `--danger-ink`, never a red fill — the single
 *    app-wide destructive pattern: danger text in a menu + a confirm Modal).
 *
 * Capability gating is server-authoritative (the page passes the flags and the
 * Server Actions re-check); items render only when allowed. The menu itself is
 * shown only if at least one action is available.
 *
 * Each destructive item opens the SAME confirm Modal + Server Action as before
 * (no duplicated server logic): delete → `deleteLeadAction`, erase →
 * `eraseLeadDataAction`.
 */
export function LeadOverflowActions({
  leadId,
  canExport,
  canErase,
  canDelete,
}: {
  leadId: string;
  canExport: boolean;
  canErase: boolean;
  canDelete: boolean;
}) {
  const t = useTranslations();
  const tg = useTranslations("gdpr");
  const tm = useMessage();
  const locale = useLocale();
  const router = useRouter();

  // ── Export: client-triggered downloads (JSON inline / Excel base64→Blob) ──
  const [isExporting, startExport] = useTransition();
  const [exportError, setExportError] = useState<string | null>(null);

  function downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  function handleExportJson(): void {
    setExportError(null);
    startExport(async () => {
      const result = await exportLeadDataAction(leadId);
      if (result.status === "error") {
        setExportError(result.formError ?? "gdpr.errors.generic");
        return;
      }
      downloadBlob(
        new Blob([JSON.stringify(result.data, null, 2)], { type: "application/json" }),
        result.filename,
      );
    });
  }

  function handleExportExcel(): void {
    setExportError(null);
    startExport(async () => {
      const result = await exportLeadDataXlsxAction(leadId);
      if (result.status === "error") {
        setExportError(result.formError ?? "gdpr.errors.generic");
        return;
      }
      // Decode the base64 .xlsx into bytes for the spreadsheet Blob.
      const binary = atob(result.base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
      downloadBlob(
        new Blob([bytes], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }),
        result.filename,
      );
    });
  }

  // ── Delete (soft): confirm dialog → navigate to list on success ──
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteState, deleteFormAction] = useActionState(deleteLeadAction, initialState);
  const [seenDelete, setSeenDelete] = useState(deleteState.status);
  if (seenDelete !== deleteState.status) {
    setSeenDelete(deleteState.status);
    if (deleteState.status === "success") setDeleteOpen(false);
  }
  useEffect(() => {
    if (deleteState.status === "success") router.push("/leads");
  }, [deleteState.status, router]);

  // ── Erase (GDPR): confirm dialog ──
  const [eraseOpen, setEraseOpen] = useState(false);
  const [eraseState, eraseFormAction] = useActionState(eraseLeadDataAction, initialState);
  const [seenErase, setSeenErase] = useState(eraseState.status);
  if (seenErase !== eraseState.status) {
    setSeenErase(eraseState.status);
    if (eraseState.status === "success") setEraseOpen(false);
  }

  if (!canExport && !canErase && !canDelete) return null;

  return (
    <div className="flex flex-col items-end gap-1">
      <DropdownMenu>
        <OverflowTrigger label={t("leadDetail.actions.menuLabel")} />
        <DropdownMenuContent>
          {canExport ? (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger disabled={isExporting}>
                {tg("export.menuLabel")}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem onSelect={handleExportExcel} disabled={isExporting}>
                  {tg("export.excel")}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={handleExportJson} disabled={isExporting}>
                  {tg("export.json")}
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          ) : null}

          {canExport && (canDelete || canErase) ? <DropdownMenuSeparator /> : null}

          {canDelete ? (
            <DropdownMenuItem variant="danger" onSelect={() => setDeleteOpen(true)}>
              {t("leads.delete.cta")}
            </DropdownMenuItem>
          ) : null}
          {canErase ? (
            <DropdownMenuItem variant="danger" onSelect={() => setEraseOpen(true)}>
              {tg("erase.cta")}
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      {exportError ? (
        <span role="alert" className="font-body text-danger-ink text-[12px]">
          {tm(exportError)}
        </span>
      ) : null}

      {/* Delete-confirm dialog (same action as before). */}
      {canDelete ? (
        <Modal
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          title={t("leads.delete.confirmTitle")}
          description={t("leads.delete.confirmBody")}
        >
          <form action={deleteFormAction} noValidate className="flex flex-col gap-4">
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="leadId" value={leadId} />
            {deleteState.status === "error" && deleteState.formError ? (
              <FormAlert tone="error">{tm(deleteState.formError)}</FormAlert>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <SubmitButton variant="danger" pendingLabel={t("leads.saving")} className="w-auto">
                {t("leads.delete.confirm")}
              </SubmitButton>
              <Button variant="ghost" onClick={() => setDeleteOpen(false)}>
                {t("leads.cancel")}
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}

      {/* Erase-confirm dialog (same action as before). */}
      {canErase ? (
        <Modal
          open={eraseOpen}
          onOpenChange={setEraseOpen}
          title={tg("erase.confirmTitle")}
          description={tg("erase.confirmBody")}
        >
          <form action={eraseFormAction} noValidate className="flex flex-col gap-4">
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="leadId" value={leadId} />
            {eraseState.status === "error" && eraseState.formError ? (
              <FormAlert tone="error">{tm(eraseState.formError)}</FormAlert>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <SubmitButton variant="danger" pendingLabel={tg("erase.pending")} className="w-auto">
                {tg("erase.confirm")}
              </SubmitButton>
              <Button variant="ghost" onClick={() => setEraseOpen(false)}>
                {tg("erase.cancel")}
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}
