"use client";

import { useCallback, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";

import type { LeadStage } from "@/generated/prisma/enums";
import type { PipelineStageConfigItem } from "@/server/pipeline";
import { useLeadStageLabel } from "@/i18n/enum-labels";
import { useMessage } from "@/components/auth/use-message";
import { FormAlert } from "@/components/auth/form-alert";
import {
  reorderStagesAction,
  setStageColorAction,
  setStageVisibilityAction,
} from "@/app/[locale]/(app)/pipeline/actions";
import { StageConfigRow } from "@/components/pipeline/config/stage-config-row";

/**
 * Pipeline configuration panel (docs/02 §2.3, docs/05 §5.6).
 *
 * Local-state editor over the tenant's stage configs with OPTIMISTIC writes
 * (TanStack Query mutations → Server Actions) and rollback + a localized error
 * banner on failure. Reordering uses accessible up/down buttons (a keyboard-only
 * alternative to dragging is the BASELINE here — docs/05 §5.6), and persists the
 * FULL order atomically. The terminal/active-lead rules are enforced server-side;
 * the client also pre-disables clearly invalid controls (hiding a terminal stage)
 * to guide the user, but never relies on that for security.
 */
export function StageConfigPanel({ stages }: { stages: readonly PipelineStageConfigItem[] }) {
  const t = useTranslations("pipelineConfig");
  const tm = useMessage();
  const stageLabel = useLeadStageLabel();

  const [items, setItems] = useState<readonly PipelineStageConfigItem[]>(stages);
  const [error, setError] = useState<string | null>(null);

  const visibilityMutation = useMutation({ mutationFn: setStageVisibilityAction });
  const reorderMutation = useMutation({ mutationFn: reorderStagesAction });
  const colorMutation = useMutation({ mutationFn: setStageColorAction });

  const run = useCallback(
    async (snapshot: readonly PipelineStageConfigItem[], op: () => Promise<unknown>) => {
      setError(null);
      try {
        await op();
      } catch (e) {
        setItems(snapshot);
        setError(e instanceof Error ? e.message : "pipeline.errors.generic");
      }
    },
    [],
  );

  const toggleVisibility = useCallback(
    (stage: LeadStage, isVisible: boolean) => {
      const snapshot = items;
      setItems((current) => current.map((it) => (it.stage === stage ? { ...it, isVisible } : it)));
      void run(snapshot, () => visibilityMutation.mutateAsync({ stage, isVisible }));
    },
    [items, run, visibilityMutation],
  );

  const setColor = useCallback(
    (stage: LeadStage, colorToken: string | null) => {
      const snapshot = items;
      setItems((current) =>
        current.map((it) => (it.stage === stage ? { ...it, colorToken } : it)),
      );
      void run(snapshot, () => colorMutation.mutateAsync({ stage, colorToken }));
    },
    [items, run, colorMutation],
  );

  const move = useCallback(
    (index: number, direction: -1 | 1) => {
      const target = index + direction;
      if (target < 0 || target >= items.length) return;
      const snapshot = items;
      const next = [...items];
      const [moved] = next.splice(index, 1);
      if (!moved) return;
      next.splice(target, 0, moved);
      const reordered = next.map((it, i) => ({ ...it, sortOrder: i }));
      setItems(reordered);
      void run(snapshot, () =>
        reorderMutation.mutateAsync({ order: reordered.map((it) => it.stage) }),
      );
    },
    [items, run, reorderMutation],
  );

  const orderedStages = useMemo(() => items.map((it) => it.stage), [items]);

  return (
    <div className="flex flex-col gap-3">
      {error ? <FormAlert tone="error">{tm(error)}</FormAlert> : null}

      <ul className="flex flex-col gap-2" aria-label={t("listLabel")}>
        {items.map((item, index) => (
          <li key={item.stage}>
            <StageConfigRow
              item={item}
              label={stageLabel(item.stage)}
              index={index}
              total={items.length}
              isFirst={index === 0}
              isLast={index === items.length - 1}
              onToggleVisibility={toggleVisibility}
              onMove={move}
              onSetColor={setColor}
            />
          </li>
        ))}
      </ul>

      <p className="sr-only" aria-live="polite">
        {orderedStages.join(", ")}
      </p>
    </div>
  );
}
