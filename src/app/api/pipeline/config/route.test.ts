import { afterEach, describe, expect, it, vi } from "vitest";

import { ForbiddenError } from "@/lib/rbac";
import { ConflictError, UnauthorizedError } from "@/lib/errors";

/**
 * Route-handler tests for /api/pipeline/config (docs/04 §4.8).
 * Covers happy path, auth missing, permission denied (configureStages),
 * invalid input (Zod → 400), the discriminated op dispatch and the
 * config-rule conflict (e.g. hiding a stage with leads → 409).
 */

const pipelineRouteContext = vi.fn();
const getPipelineConfig = vi.fn((...args: unknown[]): unknown => args);
const updateStageVisibility = vi.fn((...args: unknown[]): unknown => args);
const reorderStages = vi.fn((...args: unknown[]): unknown => args);
const setStageColor = vi.fn((...args: unknown[]): unknown => args);

vi.mock("@/server/api/pipeline-route-context", () => ({
  pipelineRouteContext: (...a: unknown[]) => pipelineRouteContext(...a),
}));
vi.mock("@/server/pipeline", () => ({
  getPipelineConfig: (...a: unknown[]) => getPipelineConfig(...a),
  updateStageVisibility: (...a: unknown[]) => updateStageVisibility(...a),
  reorderStages: (...a: unknown[]) => reorderStages(...a),
  setStageColor: (...a: unknown[]) => setStageColor(...a),
}));

import { GET, PATCH } from "@/app/api/pipeline/config/route";

const DEPS = { actor: { organizationId: "org_a", userId: "u" } };

function patch(body: unknown) {
  return new Request("http://localhost/api/pipeline/config", {
    method: "PATCH",
    body: JSON.stringify(body),
  }) as unknown as import("next/server").NextRequest;
}

afterEach(() => vi.clearAllMocks());

describe("GET /api/pipeline/config", () => {
  it("requires pipeline.view and returns the config (200)", async () => {
    pipelineRouteContext.mockResolvedValue(DEPS);
    getPipelineConfig.mockResolvedValue({ stages: [] });

    const res = await GET();

    expect(pipelineRouteContext).toHaveBeenCalledWith("pipeline.view");
    expect(res.status).toBe(200);
  });

  it("returns 401 when unauthenticated", async () => {
    pipelineRouteContext.mockRejectedValue(new UnauthorizedError());
    const res = await GET();
    expect(res.status).toBe(401);
  });
});

describe("PATCH /api/pipeline/config", () => {
  it("requires pipeline.configureStages", async () => {
    pipelineRouteContext.mockRejectedValue(new ForbiddenError("pipeline.configureStages"));
    const res = await PATCH(patch({ op: "visibility", stage: "TAKEN", isVisible: false }));
    expect(res.status).toBe(403);
    expect(updateStageVisibility).not.toHaveBeenCalled();
  });

  it("dispatches op=visibility to updateStageVisibility (200)", async () => {
    pipelineRouteContext.mockResolvedValue(DEPS);
    updateStageVisibility.mockResolvedValue({ stage: "TAKEN", isVisible: false });

    const res = await PATCH(patch({ op: "visibility", stage: "TAKEN", isVisible: false }));

    expect(updateStageVisibility).toHaveBeenCalledWith(DEPS, {
      op: "visibility",
      stage: "TAKEN",
      isVisible: false,
    });
    expect(res.status).toBe(200);
  });

  it("dispatches op=color to setStageColor (200)", async () => {
    pipelineRouteContext.mockResolvedValue(DEPS);
    setStageColor.mockResolvedValue({ stage: "TAKEN", colorToken: "--stage-won" });

    const res = await PATCH(patch({ op: "color", stage: "TAKEN", colorToken: "--stage-won" }));

    expect(setStageColor).toHaveBeenCalled();
    expect(res.status).toBe(200);
  });

  it("returns 400 for an invalid op / payload (Zod)", async () => {
    pipelineRouteContext.mockResolvedValue(DEPS);
    const res = await PATCH(patch({ op: "nope" }));
    expect(res.status).toBe(400);
    expect(updateStageVisibility).not.toHaveBeenCalled();
  });

  it("returns 409 for a config-rule conflict (hide stage with leads)", async () => {
    pipelineRouteContext.mockResolvedValue(DEPS);
    updateStageVisibility.mockRejectedValue(
      new ConflictError("pipeline.errors.config.hideWithLeads"),
    );
    const res = await PATCH(patch({ op: "visibility", stage: "TAKEN", isVisible: false }));
    expect(res.status).toBe(409);
  });
});
