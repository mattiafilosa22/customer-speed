import type { NextRequest } from "next/server";

import { deleteExternalRef } from "@/server/leads";
import { leadRouteContext } from "@/server/api/lead-route-context";
import { errorResponse, jsonResponse } from "@/server/api/respond";

/**
 * DELETE /api/external-refs/:id — remove an "Aggiornamento dati" entry
 * (docs/04 §4.7). Tenant ownership enforced by the use case (cross-tenant → 404).
 */

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const deps = await leadRouteContext("lead.note");
    const { id } = await params;
    const result = await deleteExternalRef(deps, id);
    return jsonResponse(result);
  } catch (error) {
    return errorResponse(error);
  }
}
