import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ConflictError,
  RateLimitedError,
  RecaptchaV2RequiredError,
  UnauthorizedError,
  ValidationError,
} from "@/lib/errors";

/**
 * Tests for the (auth) Server Actions. Scope: the ORCHESTRATION + non-revealing
 * error mapping the actions add on top of the already-tested use cases. The use
 * cases, prisma, auth and request headers are mocked so we assert the action's
 * own behaviour (tenant resolution, consent enforcement, error → key mapping,
 * redirect on success) deterministically.
 */

// ── Mocks ─────────────────────────────────────────────────────────────────────
const useCases = {
  login: vi.fn(),
  register: vi.fn(),
  verifyEmail: vi.fn(),
  requestPasswordReset: vi.fn(),
  resetPassword: vi.fn(),
};

vi.mock("@/server/auth", () => ({
  buildAuthDeps: vi.fn(() => ({})),
  login: (...args: unknown[]) => useCases.login(...args),
  register: (...args: unknown[]) => useCases.register(...args),
  verifyEmail: (...args: unknown[]) => useCases.verifyEmail(...args),
  requestPasswordReset: (...args: unknown[]) => useCases.requestPasswordReset(...args),
  resetPassword: (...args: unknown[]) => useCases.resetPassword(...args),
}));

const signIn = vi.fn();
vi.mock("@/lib/auth", () => ({ signIn: (...a: unknown[]) => signIn(...a) }));

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

vi.mock("@/server/tenant/resolve-organization", () => ({
  resolveOrganizationIdBySlug: vi.fn(async () => "org_fabio"),
}));

vi.mock("@/server/actions/request-meta", () => ({
  getRequestMeta: vi.fn(async () => ({ ip: "1.2.3.4", userAgent: "vitest" })),
}));

// unstable_rethrow only rethrows real framework errors; here it's a no-op so our
// thrown domain errors are caught and mapped.
vi.mock("next/navigation", () => ({ unstable_rethrow: () => {} }));

import {
  loginAction,
  registerAction,
  requestPasswordResetAction,
  resetPasswordAction,
  verifyEmailAction,
} from "@/app/[locale]/(auth)/actions";
import { resolveOrganizationIdBySlug } from "@/server/tenant/resolve-organization";

const idle = { status: "idle" } as const;

function fd(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(resolveOrganizationIdBySlug).mockResolvedValue("org_fabio");
});

describe("loginAction", () => {
  const valid = { email: "user@example.com", password: "Password123", locale: "it" };

  it("resolves the tenant, runs the pre-flight use case, then signs in with a localized redirectTo", async () => {
    useCases.login.mockResolvedValue({ userId: "u1", organizationId: "org_fabio", role: "proUser" });
    // In production signIn throws NEXT_REDIRECT; here the mock resolves, so the
    // action falls through to ok(). We assert the orchestration + redirectTo.
    signIn.mockResolvedValue(undefined);

    const result = await loginAction(idle, fd(valid));

    // No explicit slug → falls back to the neutral PLATFORM tenant default.
    expect(resolveOrganizationIdBySlug).toHaveBeenCalledWith({}, "customerspeed");
    expect(useCases.login).toHaveBeenCalledOnce();
    expect(signIn).toHaveBeenCalledWith(
      "credentials",
      expect.objectContaining({
        organizationId: "org_fabio",
        email: "user@example.com",
        redirectTo: "/dashboard",
      }),
    );
    expect(result).toEqual({ status: "success" });
  });

  it("resolves a customer tenant from an explicit organizationSlug (e.g. Fabio)", async () => {
    useCases.login.mockResolvedValue({ userId: "u1", organizationId: "org_fabio", role: "proUser" });
    signIn.mockResolvedValue(undefined);

    await loginAction(idle, fd({ ...valid, organizationSlug: "fabio" }));

    // The explicit slug overrides the platform default → Fabio can still log in.
    expect(resolveOrganizationIdBySlug).toHaveBeenCalledWith({}, "fabio");
  });

  it("uses a locale-prefixed redirectTo for non-default locales", async () => {
    useCases.login.mockResolvedValue({ userId: "u1", organizationId: "org_fabio", role: "proUser" });
    signIn.mockResolvedValue(undefined);

    await loginAction(idle, fd({ ...valid, locale: "en" }));

    expect(signIn).toHaveBeenCalledWith(
      "credentials",
      expect.objectContaining({ redirectTo: "/en/dashboard" }),
    );
  });

  it("maps a credential failure to the SAME generic key (no enumeration)", async () => {
    useCases.login.mockRejectedValue(new UnauthorizedError());
    const result = await loginAction(idle, fd(valid));
    expect(result).toEqual({ status: "error", formError: "auth.errors.invalidCredentials" });
    expect(signIn).not.toHaveBeenCalled();
  });

  it("maps rate limiting to the rateLimited key", async () => {
    useCases.login.mockRejectedValue(new RateLimitedError(60));
    const result = await loginAction(idle, fd(valid));
    expect(result).toEqual({ status: "error", formError: "auth.errors.rateLimited" });
  });

  it("maps invalid input to per-field keys", async () => {
    useCases.login.mockRejectedValue(new ValidationError({ email: ["bad"] }));
    const result = await loginAction(idle, fd(valid));
    expect(result).toEqual({
      status: "error",
      fieldErrors: { email: "auth.errors.fields.email" },
    });
  });

  it("maps RecaptchaV2RequiredError to the dedicated recaptchaV2Required status (NOT a credential error)", async () => {
    useCases.login.mockRejectedValue(new RecaptchaV2RequiredError());
    const result = await loginAction(idle, fd(valid));
    expect(result).toEqual({ status: "recaptchaV2Required" });
    expect(signIn).not.toHaveBeenCalled();
  });

  it("forwards the v2 token from the form to the login use case", async () => {
    useCases.login.mockResolvedValue({ userId: "u1", organizationId: "org_fabio", role: "proUser" });
    signIn.mockResolvedValue(undefined);

    await loginAction(idle, fd({ ...valid, recaptchaV2Token: "v2-token" }));

    expect(useCases.login).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ recaptchaV2Token: "v2-token" }),
    );
  });
});

describe("registerAction", () => {
  const base = {
    name: "Mario",
    email: "mario@example.com",
    password: "Password123",
    consentPrivacy: "on",
    consentTerms: "on",
    locale: "it",
  };

  it("requires BOTH consents before calling the use case", async () => {
    const result = await registerAction(idle, fd({ ...base, consentPrivacy: "", consentTerms: "" }));
    expect(result).toEqual({
      status: "error",
      fieldErrors: {
        consentPrivacy: "auth.errors.fields.consentPrivacy",
        consentTerms: "auth.errors.fields.consentTerms",
      },
    });
    expect(useCases.register).not.toHaveBeenCalled();
  });

  it("registers and records the versioned consents on success", async () => {
    useCases.register.mockResolvedValue({ userId: "u1" });
    const result = await registerAction(idle, fd(base));
    expect(result).toEqual({ status: "success", messageKey: "auth.register.success" });
    const callArg = useCases.register.mock.calls[0]?.[1] as { consents: unknown[] };
    expect(callArg.consents).toHaveLength(2);
  });

  it("maps a conflict to the generic non-revealing key", async () => {
    useCases.register.mockRejectedValue(new ConflictError());
    const result = await registerAction(idle, fd(base));
    expect(result).toEqual({ status: "error", formError: "auth.errors.couldNotComplete" });
  });

  it("maps RecaptchaV2RequiredError to the recaptchaV2Required status", async () => {
    useCases.register.mockRejectedValue(new RecaptchaV2RequiredError());
    const result = await registerAction(idle, fd(base));
    expect(result).toEqual({ status: "recaptchaV2Required" });
  });
});

describe("requestPasswordResetAction", () => {
  it("always returns the generic success (non-revealing)", async () => {
    useCases.requestPasswordReset.mockResolvedValue({ accepted: true });
    const result = await requestPasswordResetAction(idle, fd({ email: "x@y.z", locale: "it" }));
    expect(result).toEqual({ status: "success", messageKey: "auth.forgotPassword.success" });
  });

  it("maps RecaptchaV2RequiredError to the recaptchaV2Required status", async () => {
    useCases.requestPasswordReset.mockRejectedValue(new RecaptchaV2RequiredError());
    const result = await requestPasswordResetAction(idle, fd({ email: "x@y.z", locale: "it" }));
    expect(result).toEqual({ status: "recaptchaV2Required" });
  });
});

describe("verifyEmailAction", () => {
  it("returns success on a valid token", async () => {
    useCases.verifyEmail.mockResolvedValue({ userId: "u1" });
    const result = await verifyEmailAction(idle, fd({ token: "tok" }));
    expect(result).toEqual({ status: "success", messageKey: "auth.verifyEmail.success" });
  });

  it("maps an invalid token to a field key", async () => {
    useCases.verifyEmail.mockRejectedValue(new ValidationError({ token: ["bad"] }));
    const result = await verifyEmailAction(idle, fd({ token: "tok" }));
    expect(result).toEqual({ status: "error", fieldErrors: { token: "auth.errors.fields.token" } });
  });
});

describe("resetPasswordAction", () => {
  it("returns success on a valid reset", async () => {
    useCases.resetPassword.mockResolvedValue({ userId: "u1" });
    const result = await resetPasswordAction(idle, fd({ token: "tok", newPassword: "Password123" }));
    expect(result).toEqual({ status: "success", messageKey: "auth.resetPassword.success" });
  });
});
