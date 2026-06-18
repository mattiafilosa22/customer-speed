import type { NextRequest } from "next/server";

import { createAppointment, listAppointments } from "@/server/appointments";
import { appointmentRouteContext } from "@/server/api/appointment-route-context";
import { errorResponse, jsonResponse } from "@/server/api/respond";

/**
 * GET  /api/appointments  — paginated appointment list (docs/04 §4.5).
 *   Query: ?filter=all|todo|done&leadId=&page=&pageSize=
 * POST /api/appointments  — create an appointment ({ startAt, reason, leadId? }).
 *
 * REST contract surface (integrations / future mobile). The web UI uses the
 * Server Actions; both share the same tested use cases. Query params are parsed
 * by the use case's Zod schema, so unknown/invalid values yield 400.
 *
 * NOTE: docs/04 §4.5 lists `?filter=all|todo|done&from=&to=`. We implement the
 * `filter` tabs (the screenshot UX) plus pagination and an optional `leadId`
 * scope (needed by the lead-detail panel). A free `from/to` range is not required
 * by Fase 5 and is intentionally omitted (the mini-calendar uses the dedicated
 * month aggregate endpoint instead).
 */

export async function GET(request: NextRequest) {
  try {
    const deps = await appointmentRouteContext();
    const params = Object.fromEntries(request.nextUrl.searchParams);
    const result = await listAppointments(deps, params);
    return jsonResponse(result);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const deps = await appointmentRouteContext();
    const body: unknown = await request.json().catch(() => ({}));
    const result = await createAppointment(deps, body);
    return jsonResponse(result, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
