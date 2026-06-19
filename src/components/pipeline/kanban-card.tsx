"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useTranslations } from "next-intl";

import type { PipelineCard } from "@/server/pipeline";
import { Pill } from "@/components/ui";
import { Link } from "@/i18n/navigation";
import { stageToPill } from "@/components/leads/stage-pill";
import { useCapitalBracketLabel, useLeadStageLabel } from "@/i18n/enum-labels";
import { MoveStageMenu, type StageOption } from "@/components/pipeline/move-stage-menu";

/**
 * Kanban lead card (docs/02 §2.3, docs/05 §5.8).
 *
 * Drag handle: the whole card is a dnd-kit sortable; the listeners are attached
 * to an explicit, labelled drag-handle button so the rest of the card (the
 * "Apri" link, the "Sposta in…" menu) stays independently operable — and the
 * drag handle itself is keyboard-operable (dnd-kit's keyboard sensor). The
 * card NEVER relies on colour alone: the stage pill carries its localized text.
 *
 * `isOverlay` renders the lifted clone in the DragOverlay (no transform of its
 * own, slightly elevated).
 */
export function KanbanCard({
  card,
  stageOptions,
  isOverlay = false,
  canMove,
}: {
  card: PipelineCard;
  stageOptions: readonly StageOption[];
  isOverlay?: boolean;
  canMove: boolean;
}) {
  const t = useTranslations();
  const capitalLabel = useCapitalBracketLabel();
  const stageLabel = useLeadStageLabel();

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
    data: { stage: card.stage },
    disabled: !canMove,
  });

  const fullName = `${card.firstName} ${card.lastName}`;
  const initials = `${card.firstName.charAt(0)}${card.lastName.charAt(0)}`.toUpperCase();

  const style = isOverlay
    ? undefined
    : { transform: CSS.Translate.toString(transform), transition };

  return (
    <article
      ref={isOverlay ? undefined : setNodeRef}
      style={style}
      aria-label={t("pipeline.card.label", { name: fullName, stage: stageLabel(card.stage) })}
      className={[
        "bg-panel border-line flex flex-col gap-2 rounded-[calc(var(--radius)-4px)] border p-3 shadow-[var(--sh-sm)]",
        isDragging && !isOverlay ? "opacity-40" : "",
        isOverlay ? "shadow-[var(--sh)] rotate-1" : "",
      ].join(" ")}
    >
      <div className="flex items-start gap-2">
        {canMove ? (
          <button
            type="button"
            {...attributes}
            {...listeners}
            aria-label={t("pipeline.card.dragHandle", { name: fullName })}
            className="text-muted hover:text-ink focus-visible:ring-accent mt-0.5 cursor-grab touch-none rounded focus-visible:ring-2 focus-visible:outline-none"
          >
            <span aria-hidden="true">⠿</span>
          </button>
        ) : null}

        <span
          aria-hidden="true"
          className="bg-accent-soft text-accent-ink flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold"
        >
          {initials}
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-ink truncate font-medium">{fullName}</p>
          <p className="label-mono text-muted truncate">
            {t("leads.daysInStageLabel", { count: card.daysInStage })}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Pill stage={stageToPill(card.stage)}>{stageLabel(card.stage)}</Pill>
        {card.capitalBracket ? (
          <span className="label-mono bg-line2 text-ink rounded-pill inline-flex items-center px-2.5 py-0.5">
            {capitalLabel(card.capitalBracket)}
          </span>
        ) : null}
        {card.source ? (
          <span className="label-mono text-muted inline-flex items-center">{card.source.label}</span>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-2">
        <Link
          href={`/leads/${card.id}`}
          aria-label={t("leads.openLead", { name: fullName })}
          className="text-accent hover:text-accent-ink focus-visible:ring-accent rounded text-[13px] focus-visible:ring-2 focus-visible:outline-none"
        >
          {t("leads.open")}
        </Link>
        {canMove ? <MoveStageMenu leadId={card.id} currentStage={card.stage} stageOptions={stageOptions} /> : null}
      </div>
    </article>
  );
}
