import type { NextRequest } from "next/server";

import { createExternalRef } from "@/server/leads";
import { leadRouteContext } from "@/server/api/lead-route-context";
import { errorResponse, jsonResponse } from "@/server/api/respond";

/**
 * POST /api/leads/:id/external-refs — "Aggiornamento dati": alternative customer
 * data in an external CRM (docs/04 §4.7). `{ altName?, altEmail?, source? }`.
 */

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const deps = await leadRouteContext("lead.note");
    const { id } = await params;
    const body: unknown = await request.json().catch(() => ({}));
    const result = await createExternalRef(deps, id, body);
    return jsonResponse(result, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
