import type { NextRequest } from "next/server";

import { createLead, listLeads } from "@/server/leads";
import { leadRouteContext } from "@/server/api/lead-route-context";
import { errorResponse, jsonResponse } from "@/server/api/respond";

/**
 * GET /api/leads  — paginated "I miei lead" list (docs/04 §4.3).
 * POST /api/leads — create a lead.
 *
 * REST contract surface (integrations / future mobile). The web UI uses the
 * Server Actions; both share the same tested use cases. Query params are parsed
 * by the use case's Zod schema, so unknown/invalid values yield 400.
 */

export async function GET(request: NextRequest) {
  try {
    const deps = await leadRouteContext("lead.view");
    const params = Object.fromEntries(request.nextUrl.searchParams);
    const result = await listLeads(deps, params);
    return jsonResponse(result);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const deps = await leadRouteContext("lead.create");
    const body: unknown = await request.json().catch(() => ({}));
    const result = await createLead(deps, body);
    return jsonResponse(result, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
