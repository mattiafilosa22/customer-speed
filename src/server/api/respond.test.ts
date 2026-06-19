import { describe, expect, it } from "vitest";

import { ForbiddenError } from "@/lib/rbac";
import {
  ConflictError,
  NotFoundError,
  RateLimitedError,
  UnauthorizedError,
  ValidationError,
} from "@/lib/errors";
import { errorResponse, jsonResponse } from "@/server/api/respond";

describe("errorResponse", () => {
  it("maps ValidationError → 400 with field issues", async () => {
    const res = errorResponse(new ValidationError({ email: ["Invalid email"] }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("validation_error");
    expect(body.error.fields).toEqual({ email: ["Invalid email"] });
  });

  it("maps UnauthorizedError → 401", () => {
    expect(errorResponse(new UnauthorizedError()).status).toBe(401);
  });

  it("maps ForbiddenError → 403", () => {
    expect(errorResponse(new ForbiddenError("lead.delete")).status).toBe(403);
  });

  it("maps NotFoundError → 404", () => {
    expect(errorResponse(new NotFoundError()).status).toBe(404);
  });

  it("maps ConflictError → 409", () => {
    expect(errorResponse(new ConflictError()).status).toBe(409);
  });

  it("maps RateLimitedError → 429 with Retry-After", () => {
    const res = errorResponse(new RateLimitedError(30));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("30");
  });

  it("maps an unknown error → 500", () => {
    expect(errorResponse(new Error("boom")).status).toBe(500);
  });

  it("jsonResponse returns the payload with the given status", async () => {
    const res = jsonResponse({ id: "lead_1" }, 201);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: "lead_1" });
  });
});
