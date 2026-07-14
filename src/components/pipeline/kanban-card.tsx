"use client";

import { useRef } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useFormatter, useTranslations } from "next-intl";

import type { PipelineCard } from "@/server/pipeline";
import { Link, useRouter } from "@/i18n/navigation";
import { useLeadStageLabel } from "@/i18n/enum-labels";
import { useCapitalDisplay } from "@/components/leads/capital-display";
import { MoveStageMenu, type StageOption } from "@/components/pipeline/move-stage-menu";

/** Max pointer travel (px) between pointerdown and click that still counts as a
 * "click" rather than a drag — matches the PointerSensor `activationConstraint`
 * distance, so a gesture that started a drag never also navigates. */
const CLICK_DRAG_THRESHOLD_PX = 6;

/**
 * Kanban lead card (docs/02 §2.3, docs/05 §5.8).
 *
 * Trello-style interaction model — the WHOLE card is the mouse drag surface AND
 * a click target, kept distinct:
 *  - Drag: the `useSortable` `listeners` sit on the `<article>` (PointerSensor
 *    with `activationConstraint.distance` distinguishes a click from a drag). We
 *    deliberately do NOT spread `attributes` on the article: that would turn it
 *    into a focusable keyboard handle, conflicting with the name `<Link>` and
 *    adding a redundant tab-stop. Drag is therefore mouse/touch-only by design.
 *  - Click → detail: an `onClick` on the article navigates to `/leads/{id}`
 *    ONLY when the gesture was a real click — we record the `onPointerDown`
 *    coordinates and bail out if the pointer travelled > threshold (it was a
 *    drag) or if the event was already handled (`defaultPrevented`).
 *  - Keyboard → detail: the lead NAME is a real, focusable `<Link>` (Tab → Enter)
 *    and is the card's only navigation tab-stop. No stretched-link overlay (it
 *    would swallow drag pointer events on the card body).
 *  - Keyboard → move stage: the "Sposta in…" menu ("⋯") is the accessible
 *    ALTERNATIVE to drag (WCAG, docs/05 §5.6). Its trigger stops propagation on
 *    both pointerdown (so interacting with it never starts a card drag) and click
 *    (so opening it never navigates).
 *
 * `isOverlay` renders the lifted clone inside the DragOverlay: a static,
 * non-interactive PREVIEW — no listeners, no onClick, no link, no menu (so the
 * clone never drags, navigates, or duplicates a focusable target).
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
  const format = useFormatter();
  const router = useRouter();
  const capitalDisplay = useCapitalDisplay();
  const stageLabel = useLeadStageLabel();

  const { listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
    data: { stage: card.stage },
    disabled: !canMove,
  });

  // Pointer position at the start of a gesture, used to tell a click from a drag.
  const pointerDownAt = useRef<{ x: number; y: number } | null>(null);

  const fullName = `${card.firstName} ${card.lastName}`;
  const initials = `${card.firstName.charAt(0)}${card.lastName.charAt(0)}`.toUpperCase();
  const href = `/leads/${card.id}`;

  const style = isOverlay
    ? undefined
    : { transform: CSS.Translate.toString(transform), transition };

  /**
   * True only when the event's real DOM target is an actual DOM descendant of
   * this article. The "⋯" menu (and the loss-reason dialog) render their content
   * in a React PORTAL: it is a React child of this card, so React bubbles its
   * pointerdown/click up to the article's handlers — but in the DOM it lives
   * elsewhere, so `contains()` is false. This is what keeps a menu interaction
   * from being mistaken for a press on the card body.
   */
  const isFromCardBody = (event: React.SyntheticEvent): boolean =>
    event.currentTarget instanceof Node &&
    event.target instanceof Node &&
    event.currentTarget.contains(event.target);

  const handlePointerDown = (event: React.PointerEvent<HTMLElement>) => {
    // Ignore pointerdowns bubbling from a portal (the menu) — they are not a
    // press on the card body and must not arm a click-to-open.
    if (!isFromCardBody(event)) return;
    pointerDownAt.current = { x: event.clientX, y: event.clientY };
    // Forward to dnd-kit's PointerSensor activator so the drag can still start
    // (our handler must NOT shadow `listeners.onPointerDown`).
    listeners?.onPointerDown?.(event);
  };

  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    // A nested interactive control (name link, menu) handled it, or a drag
    // ended on this card — never navigate then.
    if (event.defaultPrevented) return;
    // A click bubbling from a portal (the menu/dialog) is not a card-body click.
    if (!isFromCardBody(event)) return;
    const start = pointerDownAt.current;
    pointerDownAt.current = null;
    // Navigate ONLY for a genuine card press: a pointerdown that landed on the
    // card body (so `start` is set) and barely moved.
    if (!start) return;
    const moved = Math.hypot(event.clientX - start.x, event.clientY - start.y);
    if (moved > CLICK_DRAG_THRESHOLD_PX) return; // it was a drag, not a click
    router.push(href);
  };

  // Interactive (non-overlay) cards are the drag surface AND a click target.
  // NOTE: spread `listeners` FIRST, then our `onPointerDown` (which itself
  // forwards to `listeners.onPointerDown`) so dnd-kit still receives it; `onClick`
  // is dnd-kit-free so it can be set directly.
  const interactiveProps =
    isOverlay || !canMove
      ? {}
      : { ...listeners, onPointerDown: handlePointerDown, onClick: handleClick };

  return (
    <article
      ref={isOverlay ? undefined : setNodeRef}
      style={style}
      aria-label={t("pipeline.card.label", { name: fullName, stage: stageLabel(card.stage) })}
      className={[
        "bg-panel border-line relative flex flex-col gap-2 rounded-[calc(var(--radius)-4px)] border p-3 shadow-[var(--sh-sm)] transition-colors",
        isOverlay
          ? "shadow-[var(--sh)] rotate-1 cursor-grabbing"
          : canMove
            ? "hover:border-accent cursor-grab touch-none active:cursor-grabbing"
            : "hover:border-accent cursor-pointer",
        isDragging && !isOverlay ? "opacity-40" : "",
      ].join(" ")}
      {...interactiveProps}
    >
      <div className="flex items-start gap-2">
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
              href={href}
              aria-label={t("leads.openLead", { name: fullName })}
              // The name is the only keyboard navigation tab-stop. It stops the
              // pointerdown from starting a card drag and the click from also
              // firing the card's onClick (Link already navigates).
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => event.stopPropagation()}
              className="text-ink hover:text-accent focus-visible:ring-accent block truncate rounded font-medium focus-visible:ring-2 focus-visible:outline-none"
            >
              {fullName}
            </Link>
          )}
          <p className="label-mono text-muted truncate">
            {t("leads.daysInStageLabel", { count: card.daysInStage })}
          </p>
        </div>

        {canMove && !isOverlay ? (
          <div className="-mt-0.5 -mr-1">
            <MoveStageMenu leadId={card.id} currentStage={card.stage} stageOptions={stageOptions} />
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {card.capitalAmount !== null || card.capitalBracket ? (
          <span className="label-mono bg-line2 text-ink rounded-pill inline-flex items-center px-2.5 py-0.5">
            {capitalDisplay({
              capitalAmount: card.capitalAmount,
              capitalBracket: card.capitalBracket,
            })}
          </span>
        ) : null}
        {card.source ? (
          <span className="label-mono text-muted inline-flex items-center">{card.source.label}</span>
        ) : null}
      </div>

      {card.nextAppointment ? (
        <p className="label-mono text-muted flex items-center gap-1">
          <span aria-hidden="true">🗓</span>
          <span className="sr-only">{t("pipeline.card.nextAppointment.label")}</span>
          {format.dateTime(new Date(card.nextAppointment.startAt), "dateTime")}
        </p>
      ) : null}
    </article>
  );
}
