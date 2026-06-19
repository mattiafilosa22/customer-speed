import type { NextRequest } from "next/server";

import { getLead, softDeleteLead, updateLead } from "@/server/leads";
import { leadRouteContext } from "@/server/api/lead-route-context";
import { errorResponse, jsonResponse } from "@/server/api/respond";

/**
 * GET /api/leads/:id    — lead detail (docs/04 §4.3).
 * PATCH /api/leads/:id  — update contact / capital / source fields.
 * DELETE /api/leads/:id — soft delete (capability `lead.delete`).
 */

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const deps = await leadRouteContext("lead.view");
    const { id } = await params;
    const lead = await getLead(deps, id);
    return jsonResponse(lead);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const deps = await leadRouteContext("lead.update");
    const { id } = await params;
    const body: unknown = await request.json().catch(() => ({}));
    const result = await updateLead(deps, id, body);
    return jsonResponse(result);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const deps = await leadRouteContext("lead.delete");
    const { id } = await params;
    const result = await softDeleteLead(deps, id);
    return jsonResponse(result);
  } catch (error) {
    return errorResponse(error);
  }
}
