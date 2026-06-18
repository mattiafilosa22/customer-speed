import type { NextRequest } from "next/server";

import { changeStage } from "@/server/leads";
import { leadRouteContext } from "@/server/api/lead-route-context";
import { errorResponse, jsonResponse } from "@/server/api/respond";

/**
 * PATCH /api/leads/:id/stage — `{ stage, lossReasonId? }` → update stage +
 * stageChangedAt + StageHistory atomically (docs/04 §4.3). LOST requires a loss
 * reason (enforced by the use case → 400 when missing).
 */

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const deps = await leadRouteContext("pipeline.move");
    const { id } = await params;
    const body: unknown = await request.json().catch(() => ({}));
    const result = await changeStage(deps, id, body);
    return jsonResponse(result);
  } catch (error) {
    return errorResponse(error);
  }
}
