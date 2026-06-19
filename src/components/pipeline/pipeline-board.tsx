"use client";

import { useCallback, useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";

import { LeadStage } from "@/generated/prisma/enums";
import type { PipelineBoardResult, PipelineCard, PipelineColumn } from "@/server/pipeline";
import { useLeadStageLabel } from "@/i18n/enum-labels";
import { useMessage } from "@/components/auth/use-message";
import { moveLeadStageAction } from "@/app/[locale]/(app)/pipeline/actions";
import { BoardContext, type LossReasonOption } from "@/components/pipeline/board-context";
import { KanbanColumn } from "@/components/pipeline/kanban-column";
import { KanbanCard } from "@/components/pipeline/kanban-card";
import { LossReasonDialog } from "@/components/pipeline/loss-reason-dialog";
import type { StageOption } from "@/components/pipeline/move-stage-menu";
import { DEFAULT_STAGE_TOKENS } from "@/components/pipeline/stage-tokens";

/**
 * Kanban board (docs/02 §2.3, docs/05 §5.6–5.8).
 *
 * State model: the server-fetched columns are the initial state; we keep a LOCAL
 * copy so drag&drop and the keyboard menu can OPTIMISTICALLY move a card between
 * columns. The actual persistence is a Server Action wrapped in a TanStack Query
 * mutation: on error we ROLL BACK to the pre-move snapshot and announce the
 * failure; on success the optimistic state stands (the RSC also revalidates).
 *
 * Accessibility (VINCOLANTE):
 *  - dnd-kit's `KeyboardSensor` makes the drag handle keyboard-operable, AND each
 *    card carries a "Sposta in…" `<select>` as a full alternative (docs/05 §5.6).
 *  - an `aria-live="polite"` region announces every successful/failed move.
 *  - moving to LOST opens the loss-reason dialog first (a reason is required).
 */
export function PipelineBoard({
  board,
  visibleStages,
  lossReasons,
  canMove,
}: {
  board: PipelineBoardResult;
  /** All stages eligible as move destinations (the visible columns' stages). */
  visibleStages: readonly LeadStage[];
  lossReasons: readonly LossReasonOption[];
  canMove: boolean;
}) {
  const t = useTranslations();
  const tm = useMessage();
  const stageLabel = useLeadStageLabel();

  const [columns, setColumns] = useState<readonly PipelineColumn[]>(board.columns);
  // The server board is the source of truth: when a URL filter (period, source)
  // changes, the RSC re-renders with a fresh `board` prop. Adopt it by resetting
  // the optimistic local state DURING render (React's "reset state on prop
  // change" pattern), tracked by reference so optimistic moves between
  // navigations are preserved. Without this, `useState`'s initial value would
  // ignore every subsequent server board and the filters would not take effect.
  const [lastBoard, setLastBoard] = useState(board);
  if (board !== lastBoard) {
    setLastBoard(board);
    setColumns(board.columns);
  }

  const [activeCard, setActiveCard] = useState<PipelineCard | null>(null);
  const [announcement, setAnnouncement] = useState("");
  // Drag-triggered LOST: remember which lead is pending a reason.
  const [lostLeadId, setLostLeadId] = useState<string | null>(null);

  const stageOptions: StageOption[] = useMemo(
    () => visibleStages.map((stage) => ({ stage, label: stageLabel(stage) })),
    [visibleStages, stageLabel],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  /** Move a card between columns in the local state (pure, returns next state). */
  const applyLocalMove = useCallback(
    (current: readonly PipelineColumn[], leadId: string, toStage: LeadStage): readonly PipelineColumn[] => {
      let moved: PipelineCard | undefined;
      const stripped = current.map((col) => {
        const found = col.cards.find((c) => c.id === leadId);
        if (!found) return col;
        moved = { ...found, stage: toStage, daysInStage: 0 };
        return {
          ...col,
          cards: col.cards.filter((c) => c.id !== leadId),
          count: col.count - 1,
        };
      });
      if (!moved) return current;
      return stripped.map((col) =>
        col.stage === toStage
          ? { ...col, cards: [moved as PipelineCard, ...col.cards], count: col.count + 1 }
          : col,
      );
    },
    [],
  );

  const mutation = useMutation({
    mutationFn: (args: { leadId: string; stage: LeadStage; lossReasonId?: string }) =>
      moveLeadStageAction(args),
  });

  /** Optimistic move with rollback + ARIA announcement. Rejects on failure. */
  const moveLead = useCallback(
    async (args: { leadId: string; stage: LeadStage; lossReasonId?: string }) => {
      // The current `columns` (closed over via the deps) is the pre-move snapshot
      // we roll back to on failure — no ref needed.
      const snapshot = columns;
      let cardName = "";
      let fromStage: LeadStage | undefined;
      for (const col of snapshot) {
        const card = col.cards.find((c) => c.id === args.leadId);
        if (card) {
          cardName = `${card.firstName} ${card.lastName}`;
          fromStage = col.stage;
          break;
        }
      }
      if (!fromStage || fromStage === args.stage) return;

      // Optimistic update.
      setColumns(applyLocalMove(snapshot, args.leadId, args.stage));

      try {
        await mutation.mutateAsync(args);
        setAnnouncement(
          t("pipeline.announce.moved", { name: cardName, stage: stageLabel(args.stage) }),
        );
      } catch (error) {
        // Roll back to the pre-move snapshot and announce the (localized) error.
        setColumns(snapshot);
        const key = error instanceof Error ? error.message : "pipeline.errors.generic";
        setAnnouncement(t("pipeline.announce.failed", { name: cardName, reason: tm(key) }));
        throw error;
      }
    },
    [columns, applyLocalMove, mutation, stageLabel, t, tm],
  );

  const boardValue = useMemo(() => ({ moveLead, lossReasons }), [moveLead, lossReasons]);

  // ── Drag handlers ────────────────────────────────────────────────────────────

  const findCard = (leadId: string): PipelineCard | null => {
    for (const col of columns) {
      const card = col.cards.find((c) => c.id === leadId);
      if (card) return card;
    }
    return null;
  };

  const onDragStart = (event: DragStartEvent) => {
    setActiveCard(findCard(String(event.active.id)));
  };

  const onDragEnd = (event: DragEndEvent) => {
    setActiveCard(null);
    const { active, over } = event;
    if (!over) return;

    const leadId = String(active.id);
    // The drop target is either a column (droppable id = stage) or a card; in
    // the latter case the card's `data.stage` gives the destination column.
    const overData = over.data.current as { stage?: LeadStage } | undefined;
    const toStage = (overData?.stage ?? (over.id as LeadStage)) as LeadStage;
    if (!toStage || !visibleStages.includes(toStage)) return;

    const card = findCard(leadId);
    if (!card || card.stage === toStage) return;

    if (toStage === LeadStage.LOST) {
      // Defer the move until a reason is chosen.
      setLostLeadId(leadId);
      return;
    }
    void moveLead({ leadId, stage: toStage }).catch(() => {
      /* handled in moveLead (rollback + announce) */
    });
  };

  return (
    <BoardContext.Provider value={boardValue}>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActiveCard(null)}
      >
        <div
          className="flex gap-4 overflow-x-auto pb-4 [scroll-snap-type:x_proximity]"
          role="list"
          aria-label={t("pipeline.boardLabel")}
        >
          {columns.map((column) => (
            <div role="listitem" key={column.stage} className="flex">
              <KanbanColumn
                stage={column.stage}
                count={column.count}
                cards={column.cards}
                colorToken={column.colorToken}
                defaultColorToken={DEFAULT_STAGE_TOKENS[column.stage]}
                hasMore={column.hasMore}
                stageOptions={stageOptions}
                canMove={canMove}
              />
            </div>
          ))}
        </div>

        <DragOverlay>
          {activeCard ? (
            <KanbanCard card={activeCard} stageOptions={stageOptions} isOverlay canMove={canMove} />
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Loss-reason dialog for a DRAG to the LOST column. */}
      {lostLeadId ? (
        <LossReasonDialog
          leadId={lostLeadId}
          open={lostLeadId !== null}
          onOpenChange={(open) => {
            if (!open) setLostLeadId(null);
          }}
        />
      ) : null}

      {/* ARIA live region: announces every move outcome (WCAG, docs/05 §5.6). */}
      <div
        aria-live="polite"
        role="status"
        aria-label={t("pipeline.announce.regionLabel")}
        data-testid="pipeline-announcer"
        className="sr-only"
      >
        {announcement}
      </div>
    </BoardContext.Provider>
  );
}
