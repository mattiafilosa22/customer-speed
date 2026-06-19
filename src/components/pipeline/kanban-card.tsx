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
 * Whole-card click → lead detail (accessible "stretched link" pattern): the
 * lead NAME is the real, focusable `<Link>` and carries a full-card `::after`
 * overlay (`after:absolute after:inset-0`) over the `relative` article, so a
 * mouse click ANYWHERE on the card activates that single link — while keyboard
 * users still reach exactly one focusable target (the name), with a descriptive
 * aria-label. No redundant "Apri" link.
 *
 * Drag handle: the whole card is a dnd-kit sortable; the listeners are attached
 * to an explicit, labelled drag-handle button. The handle and the "Sposta in…"
 * menu trigger sit ABOVE the stretched-link overlay (`relative z-10`) so they
 * stay independently clickable/keyboard-operable and their clicks do NOT
 * navigate (the overlay never covers them); the menu dropdown is in a portal,
 * already above. The card NEVER relies on colour alone: the stage pill carries
 * its localized text.
 *
 * `isOverlay` renders the lifted clone in the DragOverlay: it is a static,
 * non-interactive preview, so it omits the stretched link, the handle and the
 * menu (no navigation/drag from the clone, no duplicate focusable targets).
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
        "bg-panel border-line relative flex flex-col gap-2 rounded-[calc(var(--radius)-4px)] border p-3 shadow-[var(--sh-sm)] transition-colors",
        isOverlay ? "shadow-[var(--sh)] rotate-1" : "hover:border-accent cursor-pointer",
        isDragging && !isOverlay ? "opacity-40" : "",
      ].join(" ")}
    >
      <div className="flex items-start gap-2">
        {canMove && !isOverlay ? (
          <button
            type="button"
            {...attributes}
            {...listeners}
            aria-label={t("pipeline.card.dragHandle", { name: fullName })}
            className="text-muted hover:text-ink focus-visible:ring-accent relative z-10 mt-0.5 cursor-grab touch-none rounded focus-visible:ring-2 focus-visible:outline-none"
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
          {isOverlay ? (
            <p className="text-ink truncate font-medium">{fullName}</p>
          ) : (
            <Link
              href={`/leads/${card.id}`}
              aria-label={t("leads.openLead", { name: fullName })}
              className="text-ink hover:text-accent focus-visible:ring-accent block truncate rounded font-medium after:absolute after:inset-0 after:content-[''] focus-visible:ring-2 focus-visible:outline-none"
            >
              {fullName}
            </Link>
          )}
          <p className="label-mono text-muted truncate">
            {t("leads.daysInStageLabel", { count: card.daysInStage })}
          </p>
        </div>

        {canMove && !isOverlay ? (
          <div className="relative z-10 -mt-0.5 -mr-1">
            <MoveStageMenu leadId={card.id} currentStage={card.stage} stageOptions={stageOptions} />
          </div>
        ) : null}
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
    </article>
  );
}
