"use client";

import { useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import { Button, Card, CardBody, Input, Modal, Switch } from "@/components/ui";
import { FormAlert } from "@/components/auth/form-alert";
import { useMessage } from "@/components/auth/use-message";
import {
  exportRetentionCandidatesAction,
  getRetentionCandidatesCountAction,
  purgeRetentionCandidatesAction,
  updateRetentionSettingsAction,
} from "@/app/[locale]/(app)/settings/data-retention/actions";

const DEFAULT_MONTHS = 6;

export interface DataRetentionPanelProps {
  initialRetentionMonths: number | null;
  initialCount: number;
}

/**
 * "Pulizia lead persi" settings panel (data retention, docs/09).
 *
 * Three independent concerns, each wired to its own Server Action
 * (`settings/data-retention/actions.ts`) rather than one do-everything call —
 * mirrors how the appearance panel splits theme/branding:
 *
 *  1. Retention WINDOW (enable + months) — `settings.tenant`.
 *  2. Candidate COUNT preview — `settings.tenant`, read-only, no PII.
 *  3. Backup EXPORT + PERMANENT PURGE — `lead.exportData` / `lead.eraseData`.
 *
 * The "download before delete" rule enforced here (purge disabled until an
 * export just completed IN THIS SESSION) is a UX guardrail against accidental
 * data loss — NOT a security control. It is trivially bypassable by a direct
 * call to `purgeRetentionCandidatesAction`; the actual, non-bypassable
 * authorization is the `lead.eraseData` capability re-checked server-side on
 * every call (see the Server Action for the full note).
 *
 * No `<form action>` here: every Server Action here takes typed
 * arguments (not `FormData`), so mutations run via `startTransition` +
 * explicit handlers, same pattern as `LeadOverflowActions`'s export menu.
 */
export function DataRetentionPanel({
  initialRetentionMonths,
  initialCount,
}: DataRetentionPanelProps) {
  const t = useTranslations("dataRetention");
  const tm = useMessage();

  // ── Settings (enable + months) ────────────────────────────────────────────
  const [enabled, setEnabled] = useState(initialRetentionMonths !== null);
  const [months, setMonths] = useState(initialRetentionMonths ?? DEFAULT_MONTHS);
  const [isSaving, startSave] = useTransition();
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // ── Candidate count preview ───────────────────────────────────────────────
  const [count, setCount] = useState(initialCount);
  const [retentionMonths, setRetentionMonths] = useState(initialRetentionMonths);
  const [isRefreshing, startRefresh] = useTransition();
  const [countError, setCountError] = useState<string | null>(null);

  function refreshCount(): void {
    setCountError(null);
    startRefresh(async () => {
      try {
        const result = await getRetentionCandidatesCountAction();
        setCount(result.count);
        setRetentionMonths(result.retentionMonths);
      } catch (e) {
        setCountError(e instanceof Error ? e.message : "dataRetention.errors.generic");
      }
    });
  }

  function handleSave(): void {
    setSaveError(null);
    setSaved(false);
    startSave(async () => {
      try {
        await updateRetentionSettingsAction({
          leadRetentionMonths: enabled ? months : null,
        });
        setSaved(true);
        refreshCount();
      } catch (e) {
        setSaveError(e instanceof Error ? e.message : "dataRetention.errors.generic");
      }
    });
  }

  // ── Backup export ──────────────────────────────────────────────────────────
  const [isExporting, startExport] = useTransition();
  const [exportError, setExportError] = useState<string | null>(null);
  const [downloadedLeadIds, setDownloadedLeadIds] = useState<string[] | null>(null);
  const [downloadedCount, setDownloadedCount] = useState(0);

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

  function handleDownloadBackup(): void {
    setExportError(null);
    startExport(async () => {
      const result = await exportRetentionCandidatesAction();
      if (result.status === "error") {
        setExportError(result.formError ?? "dataRetention.errors.generic");
        return;
      }
      downloadBlob(
        new Blob([JSON.stringify(result.data, null, 2)], { type: "application/json" }),
        result.filename,
      );
      setDownloadedLeadIds(result.leadIds);
      setDownloadedCount(result.data.count);
    });
  }

  // ── Permanent purge ────────────────────────────────────────────────────────
  const [purgeOpen, setPurgeOpen] = useState(false);
  const [isPurging, startPurge] = useTransition();
  const [purgeError, setPurgeError] = useState<string | null>(null);
  const [purgeSummary, setPurgeSummary] = useState<string | null>(null);
  // Confirm-dialog safety: the "Conferma eliminazione" button is intentionally
  // NOT where keyboard/screen-reader focus lands on open (an irreversible,
  // batch anonymize action shouldn't be one stray Enter away) — focus starts
  // on "Annulla" instead (see `Modal`'s `initialFocusRef`).
  const cancelPurgeRef = useRef<HTMLButtonElement>(null);

  function handlePurgeConfirm(): void {
    if (!downloadedLeadIds || downloadedLeadIds.length === 0) return;
    setPurgeError(null);
    startPurge(async () => {
      const result = await purgeRetentionCandidatesAction(downloadedLeadIds);
      if (result.status === "error") {
        setPurgeError(result.formError ?? "dataRetention.errors.generic");
        return;
      }
      setPurgeSummary(
        t("backup.resultSummary", {
          anonymized: result.anonymized,
          alreadyAnonymized: result.alreadyAnonymized,
          failed: result.failed.length,
        }),
      );
      setPurgeOpen(false);
      // The exported backup has just been purged: it no longer represents a
      // valid "already downloaded" set, so the guardrail resets.
      setDownloadedLeadIds(null);
      setDownloadedCount(0);
      refreshCount();
    });
  }

  const canPurge = (downloadedLeadIds?.length ?? 0) > 0;

  return (
    <div className="flex flex-col gap-6">
      {/* Settings */}
      <section aria-labelledby="retention-settings-heading">
        <Card>
          <CardBody className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <h2 id="retention-settings-heading" className="font-display text-ink text-xl">
                {t("settingsSection.heading")}
              </h2>
              <p className="font-body text-muted text-[13px]">{t("settingsSection.description")}</p>
            </div>

            {saveError ? <FormAlert tone="error">{tm(saveError)}</FormAlert> : null}
            {saved ? <FormAlert tone="success">{t("settingsSection.saved")}</FormAlert> : null}

            <Switch
              label={t("settingsSection.enable")}
              checked={enabled}
              onCheckedChange={(v) => {
                setSaved(false);
                setEnabled(v);
              }}
            />

            {enabled ? (
              <Input
                label={t("settingsSection.months")}
                type="number"
                min={1}
                max={120}
                step={1}
                value={months}
                onChange={(e) => {
                  setSaved(false);
                  setMonths(Number(e.target.value));
                }}
                hint={t("settingsSection.monthsHint")}
                className="max-w-[10rem]"
              />
            ) : null}

            <Button onClick={handleSave} disabled={isSaving} aria-busy={isSaving} className="w-fit">
              {isSaving ? t("settingsSection.saving") : t("settingsSection.save")}
            </Button>
          </CardBody>
        </Card>
      </section>

      {/* Preview */}
      <section aria-labelledby="retention-preview-heading">
        <Card>
          <CardBody className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <h2 id="retention-preview-heading" className="font-display text-ink text-xl">
                {t("preview.heading")}
              </h2>
              <Button
                variant="ghost"
                onClick={refreshCount}
                disabled={isRefreshing}
                aria-busy={isRefreshing}
              >
                {isRefreshing ? t("preview.refreshing") : t("preview.refresh")}
              </Button>
            </div>
            {countError ? <FormAlert tone="error">{tm(countError)}</FormAlert> : null}
            {/* Polite live region: announces the updated count after "Aggiorna
                conteggio" (or an implicit refresh post-save) without moving
                focus — the count is a query result, not an alert. */}
            <p className="font-body text-ink text-[14px]" aria-live="polite">
              {retentionMonths === null ? t("preview.disabled") : t("preview.count", { count })}
            </p>
          </CardBody>
        </Card>
      </section>

      {/* Backup + purge */}
      <section aria-labelledby="retention-backup-heading">
        <Card>
          <CardBody className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <h2 id="retention-backup-heading" className="font-display text-ink text-xl">
                {t("backup.heading")}
              </h2>
              <p className="font-body text-muted text-[13px]">{t("backup.description")}</p>
            </div>

            {exportError ? <FormAlert tone="error">{tm(exportError)}</FormAlert> : null}
            {purgeSummary ? <FormAlert tone="success">{purgeSummary}</FormAlert> : null}
            {downloadedLeadIds && downloadedLeadIds.length > 0 ? (
              <FormAlert tone="success">
                {t("backup.downloadedHint", { count: downloadedCount })}
              </FormAlert>
            ) : null}
            {downloadedLeadIds && downloadedLeadIds.length === 0 ? (
              <FormAlert tone="warning">{t("backup.noCandidates")}</FormAlert>
            ) : null}

            <div className="flex flex-wrap gap-3">
              <Button
                onClick={handleDownloadBackup}
                disabled={isExporting}
                aria-busy={isExporting}
                variant="ghost"
              >
                {isExporting ? t("backup.downloading") : t("backup.downloadCta")}
              </Button>
              {/* Trigger stays TEXT-styled danger (never a filled red button
                  outside the confirm dialog — the single app-wide destructive
                  pattern, see `LeadOverflowActions`); the filled `danger`
                  Button is reserved for the actual confirm action below. The
                  hover tint is danger-soft (not the ghost default accent-soft)
                  so the destructive intent reads on hover too. */}
              <Button
                variant="ghost"
                onClick={() => setPurgeOpen(true)}
                disabled={!canPurge || isPurging}
                className="text-danger-ink hover:bg-danger-soft"
              >
                {t("backup.purgeCta")}
              </Button>
            </div>
            {!canPurge ? (
              <p className="font-body text-muted text-[12px]">{t("backup.purgeHint")}</p>
            ) : null}
          </CardBody>
        </Card>
      </section>

      <Modal
        open={purgeOpen}
        // Block Escape/overlay-dismiss while the purge is in flight: it runs
        // in a `useTransition` detached from the dialog's open state, and its
        // error alert is only rendered inside these children — closing early
        // would both hide a possible failure from the user and (for
        // screen-reader users) discard the outcome silently.
        onOpenChange={(next) => {
          if (!next && isPurging) return;
          setPurgeOpen(next);
        }}
        title={t("backup.confirmTitle")}
        description={t("backup.confirmBody", { count: downloadedLeadIds?.length ?? 0 })}
        initialFocusRef={cancelPurgeRef}
      >
        <div className="flex flex-col gap-4">
          {purgeError ? <FormAlert tone="error">{tm(purgeError)}</FormAlert> : null}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="danger"
              onClick={handlePurgeConfirm}
              disabled={isPurging || !canPurge}
              aria-busy={isPurging}
              className="w-auto"
            >
              {isPurging ? t("backup.purgePending") : t("backup.confirmConfirm")}
            </Button>
            <Button
              ref={cancelPurgeRef}
              variant="ghost"
              onClick={() => setPurgeOpen(false)}
              disabled={isPurging}
            >
              {t("backup.confirmCancel")}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
