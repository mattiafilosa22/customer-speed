import type { NextRequest } from "next/server";

import { createNote, listNotes } from "@/server/leads";
import { leadRouteContext } from "@/server/api/lead-route-context";
import { errorResponse, jsonResponse } from "@/server/api/respond";

/**
 * GET /api/leads/:id/notes  — list a lead's notes (docs/04 §4.4).
 * POST /api/leads/:id/notes — create a note `{ body }`.
 */

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const deps = await leadRouteContext("lead.view");
    const { id } = await params;
    const notes = await listNotes(deps, id);
    return jsonResponse({ data: notes });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const deps = await leadRouteContext("lead.note");
    const { id } = await params;
    const body: unknown = await request.json().catch(() => ({}));
    const result = await createNote(deps, id, body);
    return jsonResponse(result, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
