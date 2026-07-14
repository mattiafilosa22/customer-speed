"use client";

import { createContext, useContext } from "react";

import type { LeadStage } from "@/generated/prisma/enums";

export interface LossReasonOption {
  readonly id: string;
  readonly label: string;
}

/**
 * Shared board behaviour exposed to the cards/menus without prop-drilling.
 *
 * `moveLead` performs the optimistic move (cache update + Server Action + rollback
 * on error). It returns a promise that REJECTS on failure so callers (e.g. the
 * loss-reason dialog) can keep themselves open and show the localized error.
 * `lossReasons` are the tenant's loss reasons (required when moving to LOST,
 * unless the caller supplies a free-text `lossReasonCustomText` instead — the
 * two are mutually exclusive, enforced server-side).
 */
export interface BoardContextValue {
  moveLead: (args: {
    leadId: string;
    stage: LeadStage;
    lossReasonId?: string;
    lossReasonCustomText?: string;
  }) => Promise<void>;
  lossReasons: readonly LossReasonOption[];
}

export const BoardContext = createContext<BoardContextValue | null>(null);

export function useBoard(): BoardContextValue {
  const ctx = useContext(BoardContext);
  if (!ctx) {
    throw new Error("useBoard must be used within a PipelineBoard");
  }
  return ctx;
}
