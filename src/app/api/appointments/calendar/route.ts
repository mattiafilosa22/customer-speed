import type { NextRequest } from "next/server";

import { getAppointmentsForMonth } from "@/server/appointments";
import { appointmentRouteContext } from "@/server/api/appointment-route-context";
import { errorResponse, jsonResponse } from "@/server/api/respond";

/**
 * GET /api/appointments/calendar?year=&month= — DB-side aggregate of the days in
 * a month that have appointments, for the sidebar mini-calendar (docs/02 §2.7).
 *
 * Not in docs/04 §4.5 (which lists CRUD only). Added as a coherent REST extension
 * under the appointments resource so the client mini-calendar can fetch month
 * markers without loading any appointment rows (the use case returns ≤31 small
 * day/count pairs). Gated by `appointment.manage`, tenant-scoped via the use case.
 */
export async function GET(request: NextRequest) {
  try {
    const deps = await appointmentRouteContext();
    const params = Object.fromEntries(request.nextUrl.searchParams);
    const result = await getAppointmentsForMonth(deps, params);
    return jsonResponse(result);
  } catch (error) {
    return errorResponse(error);
  }
}
