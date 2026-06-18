import type { NextRequest } from "next/server";

import { deleteNote, updateNote } from "@/server/leads";
import { leadRouteContext } from "@/server/api/lead-route-context";
import { errorResponse, jsonResponse } from "@/server/api/respond";

/**
 * PATCH /api/notes/:noteId  — update a note `{ body }` (docs/04 §4.4).
 * DELETE /api/notes/:noteId — delete a note.
 * Tenant + note ownership enforced by the use case (cross-tenant → 404).
 */

type Params = { params: Promise<{ noteId: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const deps = await leadRouteContext("lead.note");
    const { noteId } = await params;
    const body: unknown = await request.json().catch(() => ({}));
    const result = await updateNote(deps, noteId, body);
    return jsonResponse(result);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const deps = await leadRouteContext("lead.note");
    const { noteId } = await params;
    const result = await deleteNote(deps, noteId);
    return jsonResponse(result);
  } catch (error) {
    return errorResponse(error);
  }
}
