import type { NextRequest } from "next/server";

import {
  changeAppointmentStatus,
  deleteAppointment,
  getAppointment,
  updateAppointment,
} from "@/server/appointments";
import { appointmentRouteContext } from "@/server/api/appointment-route-context";
import { errorResponse, jsonResponse } from "@/server/api/respond";

/**
 * GET    /api/appointments/:id — detail (for an edit form).
 * PATCH  /api/appointments/:id — update fields AND/OR change status (docs/04 §4.5).
 * DELETE /api/appointments/:id — delete.
 *
 * PATCH semantics: a body carrying `status` triggers the status-change use case
 * (the dedicated transition); a body carrying start/reason/lead triggers the
 * field update. Both may be sent — status is applied last. Each step runs its own
 * tested, tenant-scoped use case.
 */

type Params = { params: Promise<{ id: string }> };

function hasStatus(body: unknown): body is { status: unknown } {
  return typeof body === "object" && body !== null && "status" in body;
}

function hasFieldUpdate(body: unknown): boolean {
  if (typeof body !== "object" || body === null) return false;
  return "startAt" in body || "reason" in body || "leadId" in body;
}

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const deps = await appointmentRouteContext();
    const { id } = await params;
    const appointment = await getAppointment(deps, id);
    return jsonResponse(appointment);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const deps = await appointmentRouteContext();
    const { id } = await params;
    const body: unknown = await request.json().catch(() => ({}));

    if (hasFieldUpdate(body)) {
      await updateAppointment(deps, id, body);
    }
    if (hasStatus(body)) {
      await changeAppointmentStatus(deps, id, { status: body.status });
    }
    return jsonResponse({ id });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const deps = await appointmentRouteContext();
    const { id } = await params;
    const result = await deleteAppointment(deps, { id });
    return jsonResponse(result);
  } catch (error) {
    return errorResponse(error);
  }
}
