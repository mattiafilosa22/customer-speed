"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useTranslations } from "next-intl";

import type { LeadStage } from "@/generated/prisma/enums";
import type { PipelineCard } from "@/server/pipeline";
import { useLeadStageLabel } from "@/i18n/enum-labels";
import { KanbanCard } from "@/components/pipeline/kanban-card";
import type { StageOption } from "@/components/pipeline/move-stage-menu";

/**
 * Kanban column for one visible stage (docs/02 §2.3, docs/05 §5.8).
 *
 * - A droppable region (dnd-kit) holding the stage's sortable cards.
 * - The header shows the localized stage label + the DB-side count.
 * - The colour accent comes from the tenant's stage token (`colorToken` override
 *   or the default `--stage-*`), applied via a CSS variable — never hard-coded.
 * - Semantics: a labelled region with a heading + a `<ul>/<li>` card list so
 *   screen readers can navigate columns and items.
 */
export function KanbanColumn({
  stage,
  count,
  cards,
  colorToken,
  defaultColorToken,
  hasMore,
  stageOptions,
  canMove,
}: {
  stage: LeadStage;
  count: number;
  cards: readonly PipelineCard[];
  colorToken: string | null;
  defaultColorToken: string;
  hasMore: boolean;
  stageOptions: readonly StageOption[];
  canMove: boolean;
}) {
  const t = useTranslations();
  const stageLabel = useLeadStageLabel();
  const { setNodeRef, isOver } = useDroppable({ id: stage, data: { stage } });

  const accent = `var(${colorToken ?? defaultColorToken})`;
  const label = stageLabel(stage);

  return (
    <section
      aria-label={t("pipeline.column.label", { stage: label, count })}
      className="bg-bg flex h-full w-[280px] shrink-0 snap-start flex-col rounded-[var(--radius)]"
    >
      <header className="flex items-center justify-between gap-2 px-1 pb-2">
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: accent }}
          />
          <h2 className="font-display text-ink text-[15px]">{label}</h2>
        </div>
        <span className="label-mono bg-panel text-muted border-line rounded-pill border px-2 py-0.5">
          {count}
        </span>
      </header>

      <div
        ref={setNodeRef}
        className={[
          "flex min-h-24 flex-1 flex-col gap-2 rounded-[var(--radius)] p-1 transition-colors",
          isOver ? "bg-accent-soft" : "",
        ].join(" ")}
      >
        <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          <ul className="flex flex-col gap-2">
            {cards.map((card) => (
              <li key={card.id}>
                <KanbanCard card={card} stageOptions={stageOptions} canMove={canMove} />
              </li>
            ))}
          </ul>
        </SortableContext>

        {cards.length === 0 ? (
          <p className="text-muted px-2 py-6 text-center text-[13px]">{t("pipeline.column.empty")}</p>
        ) : null}

        {hasMore ? (
          <p className="text-muted px-2 py-1 text-center text-[12px]">
            {t("pipeline.column.more", { count: count - cards.length })}
          </p>
        ) : null}
      </div>
    </section>
  );
}
