import type { NextRequest } from "next/server";

import { parseInput } from "@/server/validation";
import {
  getPipelineConfig,
  reorderStages,
  setStageColor,
  updateStageVisibility,
} from "@/server/pipeline";
import { configPatchSchema } from "@/server/pipeline/schemas";
import { pipelineRouteContext } from "@/server/api/pipeline-route-context";
import { errorResponse, jsonResponse } from "@/server/api/respond";

/**
 * Pipeline configuration REST contract (docs/04 §4.8).
 *
 *   GET   /api/pipeline/config  → stages with visibility/order/colour + counts
 *                                 (capability `pipeline.view`)
 *   PATCH /api/pipeline/config  → show/hide, reorder, recolour a stage
 *                                 (capability `pipeline.configureStages`)
 *
 * Each handler runs the full pipeline: auth → RBAC → tenant → Zod → use case →
 * typed response. The PATCH body is discriminated by `op` and delegated to the
 * matching, tested use case (which also enforces the terminal/active-lead rules).
 */

export async function GET() {
  try {
    const deps = await pipelineRouteContext("pipeline.view");
    const result = await getPipelineConfig(deps);
    return jsonResponse(result);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const deps = await pipelineRouteContext("pipeline.configureStages");
    const body: unknown = await request.json().catch(() => ({}));
    const command = parseInput(configPatchSchema, body);

    switch (command.op) {
      case "visibility": {
        const result = await updateStageVisibility(deps, command);
        return jsonResponse(result);
      }
      case "reorder": {
        const result = await reorderStages(deps, command);
        return jsonResponse(result);
      }
      case "color": {
        const result = await setStageColor(deps, command);
        return jsonResponse(result);
      }
    }
  } catch (error) {
    return errorResponse(error);
  }
}
