import { describe, expect, it } from "vitest";

import {
  ConflictError,
  RateLimitedError,
  UnauthorizedError,
  ValidationError,
} from "@/lib/errors";
import { ForbiddenError } from "@/lib/rbac";
import { type ErrorKeyMap, toActionState } from "@/server/actions/action-result";

const keys: ErrorKeyMap = {
  unauthorized: "u",
  conflict: "c",
  rateLimited: "r",
  generic: "g",
  fieldErrorKey: (f) => `field.${f}`,
};

describe("toActionState", () => {
  it("maps ValidationError to per-field keys", () => {
    const result = toActionState(new ValidationError({ email: ["x"], password: ["y"] }), keys);
    expect(result).toEqual({
      status: "error",
      fieldErrors: { email: "field.email", password: "field.password" },
    });
  });

  it("maps UnauthorizedError AND ForbiddenError to the same unauthorized key (non-revealing)", () => {
    expect(toActionState(new UnauthorizedError(), keys)).toEqual({ status: "error", formError: "u" });
    expect(toActionState(new ForbiddenError("lead.delete"), keys)).toEqual({
      status: "error",
      formError: "u",
    });
  });

  it("maps ConflictError and RateLimitedError to their keys", () => {
    expect(toActionState(new ConflictError(), keys)).toEqual({ status: "error", formError: "c" });
    expect(toActionState(new RateLimitedError(60), keys)).toEqual({
      status: "error",
      formError: "r",
    });
  });

  it("maps unknown errors to the generic key (does not throw)", () => {
    expect(toActionState(new Error("boom"), keys)).toEqual({ status: "error", formError: "g" });
  });
});
