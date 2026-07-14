"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import { Button, Card, CardBody, EmptyState, Input, Pill } from "@/components/ui";
import { FormAlert } from "@/components/auth/form-alert";
import { useMessage } from "@/components/auth/use-message";
import {
  createLossReasonAction,
  reorderLossReasonsAction,
  toggleLossReasonActiveAction,
  updateLossReasonAction,
} from "@/app/[locale]/(app)/settings/loss-reasons/actions";
import type { LossReasonItem } from "@/server/loss-reasons";

export interface LossReasonsPanelProps {
  initialReasons: readonly LossReasonItem[];
}

/**
 * "Motivi di perdita" Settings panel (docs/02 §2.5-bis).
 *
 * Manages the FULL tenant list (active + inactive — a deactivated reason stays
 * here so it can be renamed/reactivated, even though it no longer appears in
 * the "sposta in Perso" picker). Local-state editor with OPTIMISTIC writes
 * (snapshot → apply → Server Action → rollback + localized error on failure),
 * mirroring `StageConfigPanel`. Reordering uses accessible up/down buttons — a
 * keyboard-only alternative to dragging is the BASELINE (docs/05 §5.6), same
 * pattern as the pipeline stage config.
 *
 * No `<form action>` for rename/reorder/toggle: the Server Actions take typed
 * arguments, not `FormData`, so mutations run via `startTransition` + explicit
 * handlers (mirrors `DataRetentionPanel`). The "Aggiungi motivo" form is the one
 * exception with real form semantics (label + submit), so it stays a native
 * `<form onSubmit>` for the Enter-to-submit affordance.
 */
export function LossReasonsPanel({ initialReasons }: LossReasonsPanelProps) {
  const t = useTranslations("lossReasons");
  const tm = useMessage();

  const [items, setItems] = useState<readonly LossReasonItem[]>(initialReasons);
  const [error, setError] = useState<string | null>(null);

  const [isPending, startTransition] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");

  const [newLabel, setNewLabel] = useState("");
  const [isAdding, startAdd] = useTransition();

  function runMutation(
    id: string | null,
    snapshot: readonly LossReasonItem[],
    op: () => Promise<unknown>,
  ): void {
    setError(null);
    setPendingId(id);
    startTransition(async () => {
      try {
        await op();
      } catch (e) {
        setItems(snapshot);
        setError(e instanceof Error ? e.message : "lossReasons.errors.generic");
      } finally {
        setPendingId(null);
      }
    });
  }

  function handleAdd(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const label = newLabel.trim();
    if (!label) return;
    setError(null);
    startAdd(async () => {
      try {
        const created = await createLossReasonAction({ label });
        setItems((current) => [...current, created]);
        setNewLabel("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "lossReasons.errors.generic");
      }
    });
  }

  function startRename(reason: LossReasonItem): void {
    setError(null);
    setEditingId(reason.id);
    setEditLabel(reason.label);
  }

  function cancelRename(): void {
    setEditingId(null);
    setEditLabel("");
  }

  function saveRename(reason: LossReasonItem): void {
    const label = editLabel.trim();
    if (!label || label === reason.label) {
      cancelRename();
      return;
    }
    const snapshot = items;
    setItems((current) => current.map((it) => (it.id === reason.id ? { ...it, label } : it)));
    setEditingId(null);
    runMutation(reason.id, snapshot, () => updateLossReasonAction({ id: reason.id, label }));
  }

  function toggleActive(reason: LossReasonItem): void {
    const snapshot = items;
    const nextActive = !reason.isActive;
    setItems((current) =>
      current.map((it) => (it.id === reason.id ? { ...it, isActive: nextActive } : it)),
    );
    runMutation(reason.id, snapshot, () =>
      toggleLossReasonActiveAction({ id: reason.id, isActive: nextActive }),
    );
  }

  function move(index: number, direction: -1 | 1): void {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    const snapshot = items;
    const next = [...items];
    const [moved] = next.splice(index, 1);
    if (!moved) return;
    next.splice(target, 0, moved);
    const reordered = next.map((it, i) => ({ ...it, sortOrder: i }));
    setItems(reordered);
    runMutation(null, snapshot, () =>
      reorderLossReasonsAction({ order: reordered.map((it) => it.id) }),
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="loss-reasons-heading">
        <Card>
          <CardBody className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <h2 id="loss-reasons-heading" className="font-display text-ink text-xl">
                {t("listHeading")}
              </h2>
              <p className="font-body text-muted text-[13px]">{t("listDescription")}</p>
            </div>

            {error ? <FormAlert tone="error">{tm(error)}</FormAlert> : null}

            {items.length === 0 ? (
              <EmptyState message={t("empty")} />
            ) : (
              <ul className="flex flex-col gap-2" aria-label={t("listLabel")}>
                {items.map((reason, index) => {
                  const isEditing = editingId === reason.id;
                  const isRowPending = isPending && pendingId === reason.id;
                  return (
                    <li key={reason.id}>
                      <div className="border-line bg-panel flex flex-wrap items-center gap-3 rounded-[var(--radius)] border p-3">
                        {/* Reorder controls */}
                        <div className="flex flex-col gap-0.5">
                          <button
                            type="button"
                            onClick={() => move(index, -1)}
                            disabled={index === 0 || isPending}
                            aria-label={t("moveUp", { label: reason.label })}
                            className="text-muted hover:text-ink focus-visible:outline-ring cursor-pointer rounded px-1 leading-none disabled:cursor-not-allowed disabled:opacity-30 focus-visible:outline-2"
                          >
                            <span aria-hidden="true">▲</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => move(index, 1)}
                            disabled={index === items.length - 1 || isPending}
                            aria-label={t("moveDown", { label: reason.label })}
                            className="text-muted hover:text-ink focus-visible:outline-ring cursor-pointer rounded px-1 leading-none disabled:cursor-not-allowed disabled:opacity-30 focus-visible:outline-2"
                          >
                            <span aria-hidden="true">▼</span>
                          </button>
                        </div>

                        <span className="label-mono text-muted w-6 text-center" aria-hidden="true">
                          {index + 1}/{items.length}
                        </span>

                        {isEditing ? (
                          <form
                            className="flex min-w-0 flex-1 flex-wrap items-center gap-2"
                            onSubmit={(event) => {
                              event.preventDefault();
                              saveRename(reason);
                            }}
                          >
                            <Input
                              label={t("renameFieldLabel", { label: reason.label })}
                              value={editLabel}
                              onChange={(event) => setEditLabel(event.target.value)}
                              autoFocus
                              className="max-w-xs"
                            />
                            <Button type="submit" variant="ghost" disabled={isPending}>
                              {t("save")}
                            </Button>
                            <Button type="button" variant="ghost" onClick={cancelRename}>
                              {t("cancel")}
                            </Button>
                          </form>
                        ) : (
                          <div className="flex min-w-0 flex-1 items-center gap-2">
                            <p className="text-ink min-w-0 truncate font-medium">{reason.label}</p>
                            <Pill tone={reason.isActive ? "ok" : "warn"}>
                              {reason.isActive ? t("statusActive") : t("statusInactive")}
                            </Pill>
                          </div>
                        )}

                        {!isEditing ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <Button
                              type="button"
                              variant="ghost"
                              onClick={() => startRename(reason)}
                              disabled={isPending}
                              aria-label={t("renameAria", { label: reason.label })}
                            >
                              {t("rename")}
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              onClick={() => toggleActive(reason)}
                              disabled={isPending}
                              aria-busy={isRowPending}
                              aria-label={
                                reason.isActive
                                  ? t("deactivateAria", { label: reason.label })
                                  : t("reactivateAria", { label: reason.label })
                              }
                            >
                              {reason.isActive ? t("deactivate") : t("reactivate")}
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            <p className="sr-only" aria-live="polite">
              {items.map((it) => it.label).join(", ")}
            </p>
          </CardBody>
        </Card>
      </section>

      <section aria-labelledby="loss-reasons-add-heading">
        <Card>
          <CardBody className="flex flex-col gap-3">
            <h2 id="loss-reasons-add-heading" className="font-display text-ink text-xl">
              {t("addHeading")}
            </h2>
            <form className="flex flex-wrap items-end gap-3" onSubmit={handleAdd}>
              <Input
                label={t("addLabel")}
                value={newLabel}
                onChange={(event) => setNewLabel(event.target.value)}
                className="max-w-xs"
              />
              <Button type="submit" disabled={isAdding || newLabel.trim().length === 0}>
                {isAdding ? t("adding") : t("add")}
              </Button>
            </form>
          </CardBody>
        </Card>
      </section>
    </div>
  );
}
