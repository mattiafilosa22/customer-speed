import { afterEach, describe, expect, it, vi } from "vitest";

import { ForbiddenError } from "@/lib/rbac";
import { NotFoundError, UnauthorizedError, ValidationError } from "@/lib/errors";

/**
 * Route-handler tests for PATCH /api/leads/:id/stage — the stage-change endpoint.
 * Covers happy path, auth missing, permission denied, the LOST-requires-reason
 * rule (mapped to 400) and cross-tenant lead (mapped to 404).
 */

const leadRouteContext = vi.fn();
const changeStage = vi.fn();

vi.mock("@/server/api/lead-route-context", () => ({
  leadRouteContext: (...args: unknown[]) => leadRouteContext(...args),
}));
vi.mock("@/server/leads", () => ({
  changeStage: (...args: unknown[]) => changeStage(...args),
}));

import { PATCH } from "@/app/api/leads/[id]/stage/route";

const FAKE_DEPS = { actor: { organizationId: "org_a", userId: "u" } };

function req(body: unknown) {
  return new Request("http://localhost/api/leads/lead_1/stage", {
    method: "PATCH",
    body: JSON.stringify(body),
  }) as unknown as import("next/server").NextRequest;
}
const params = Promise.resolve({ id: "lead_1" });

afterEach(() => vi.clearAllMocks());

describe("PATCH /api/leads/:id/stage", () => {
  it("requires pipeline.move and changes the stage (happy path)", async () => {
    leadRouteContext.mockResolvedValue(FAKE_DEPS);
    changeStage.mockResolvedValue({ id: "lead_1", changed: true });

    const res = await PATCH(req({ stage: "TAKEN" }), { params });

    expect(leadRouteContext).toHaveBeenCalledWith("pipeline.move");
    expect(changeStage).toHaveBeenCalledWith(FAKE_DEPS, "lead_1", { stage: "TAKEN" });
    expect(res.status).toBe(200);
  });

  it("returns 401 when unauthenticated", async () => {
    leadRouteContext.mockRejectedValue(new UnauthorizedError());
    const res = await PATCH(req({ stage: "TAKEN" }), { params });
    expect(res.status).toBe(401);
    expect(changeStage).not.toHaveBeenCalled();
  });

  it("returns 403 without pipeline.move", async () => {
    leadRouteContext.mockRejectedValue(new ForbiddenError("pipeline.move"));
    const res = await PATCH(req({ stage: "TAKEN" }), { params });
    expect(res.status).toBe(403);
  });

  it("returns 400 when moving to LOST without a reason (use case rule)", async () => {
    leadRouteContext.mockResolvedValue(FAKE_DEPS);
    changeStage.mockRejectedValue(new ValidationError({ lossReasonId: ["required"] }));
    const res = await PATCH(req({ stage: "LOST" }), { params });
    expect(res.status).toBe(400);
  });

  it("returns 404 for a cross-tenant / missing lead", async () => {
    leadRouteContext.mockResolvedValue(FAKE_DEPS);
    changeStage.mockRejectedValue(new NotFoundError());
    const res = await PATCH(req({ stage: "TAKEN" }), { params });
    expect(res.status).toBe(404);
  });
});
