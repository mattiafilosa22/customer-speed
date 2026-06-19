import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { ForbiddenError } from "@/lib/rbac";
import { UnauthorizedError, ValidationError } from "@/lib/errors";

/**
 * Route-handler tests for /api/leads. We mock the auth→RBAC→tenant prefix
 * (`leadRouteContext`) and the use cases, then assert the handler wires them in
 * the right order and maps errors to the correct HTTP status (docs/00 §4, §5:
 * happy + auth missing + permission denied + invalid input).
 */

const leadRouteContext = vi.fn();
const listLeads = vi.fn();
const createLead = vi.fn();

vi.mock("@/server/api/lead-route-context", () => ({
  leadRouteContext: (...args: unknown[]) => leadRouteContext(...args),
}));
vi.mock("@/server/leads", () => ({
  listLeads: (...args: unknown[]) => listLeads(...args),
  createLead: (...args: unknown[]) => createLead(...args),
}));

import { GET, POST } from "@/app/api/leads/route";

const FAKE_DEPS = { actor: { organizationId: "org_a", userId: "u" } };

function getRequest(url = "http://localhost/api/leads?stage=LOST") {
  return new NextRequest(url);
}
function postRequest(body: unknown) {
  return new NextRequest("http://localhost/api/leads", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

afterEach(() => vi.clearAllMocks());

describe("GET /api/leads", () => {
  it("requires lead.view and returns the paginated list (happy path)", async () => {
    leadRouteContext.mockResolvedValue(FAKE_DEPS);
    listLeads.mockResolvedValue({
      data: [],
      total: 0,
      page: 1,
      pageSize: 25,
      stageCounts: { all: 0 },
    });

    const res = await GET(getRequest());

    expect(leadRouteContext).toHaveBeenCalledWith("lead.view");
    expect(res.status).toBe(200);
    // Query string is forwarded to the use case.
    expect(listLeads).toHaveBeenCalledWith(FAKE_DEPS, expect.objectContaining({ stage: "LOST" }));
  });

  it("returns 401 when unauthenticated", async () => {
    leadRouteContext.mockRejectedValue(new UnauthorizedError());
    const res = await GET(getRequest());
    expect(res.status).toBe(401);
    expect(listLeads).not.toHaveBeenCalled();
  });

  it("returns 403 when the role lacks the capability", async () => {
    leadRouteContext.mockRejectedValue(new ForbiddenError("lead.view"));
    const res = await GET(getRequest());
    expect(res.status).toBe(403);
  });
});

describe("POST /api/leads", () => {
  it("requires lead.create and returns 201 on success", async () => {
    leadRouteContext.mockResolvedValue(FAKE_DEPS);
    createLead.mockResolvedValue({ id: "lead_1" });

    const res = await POST(postRequest({ firstName: "Mario", lastName: "Rossi" }));

    expect(leadRouteContext).toHaveBeenCalledWith("lead.create");
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: "lead_1" });
  });

  it("returns 400 on invalid input (use case throws ValidationError)", async () => {
    leadRouteContext.mockResolvedValue(FAKE_DEPS);
    createLead.mockRejectedValue(new ValidationError({ firstName: ["Required"] }));

    const res = await POST(postRequest({ firstName: "" }));
    expect(res.status).toBe(400);
  });

  it("returns 403 when the role lacks lead.create", async () => {
    leadRouteContext.mockRejectedValue(new ForbiddenError("lead.create"));
    const res = await POST(postRequest({ firstName: "Mario", lastName: "Rossi" }));
    expect(res.status).toBe(403);
    expect(createLead).not.toHaveBeenCalled();
  });
});
