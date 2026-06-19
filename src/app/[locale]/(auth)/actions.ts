"use server";

import { unstable_rethrow } from "next/navigation";

import { signIn } from "@/lib/auth";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { asLocale, routing } from "@/i18n/routing";
import {
  buildAuthDeps,
  login,
  register,
  requestPasswordReset,
  resetPassword,
  verifyEmail,
} from "@/server/auth";
import {
  type ActionState,
  type ErrorKeyMap,
  fail,
  ok,
  toActionState,
} from "@/server/actions/action-result";
import { getRequestMeta } from "@/server/actions/request-meta";
import { registrationConsents } from "@/server/consent/consent-types";
import { resolveOrganizationIdBySlug } from "@/server/tenant/resolve-organization";

/**
 * Auth Server Actions — the ONLY boundary the auth forms talk to (docs/00 §1:
 * UI → Server Action → existing use cases → services). They:
 *   1. read request metadata (IP/UA) for audit/consent + rate limiting,
 *   2. resolve the tenant (slug → organizationId) — single-domain model,
 *   3. delegate to the pre-built, tested use cases (no business logic here),
 *   4. map typed domain errors to NON-REVEALING i18n message keys.
 *
 * Login/forgot deliberately collapse every failure to a single generic key so
 * accounts cannot be enumerated (docs/06 §6.1). The use cases already enforce
 * rate limiting + reCAPTCHA + constant-ish timing; the action only orchestrates.
 */

/** i18n keys live under the `auth.*` namespace; field keys map 1:1 to fields. */
const errorKeys = (genericField: string): ErrorKeyMap => ({
  unauthorized: "auth.errors.invalidCredentials",
  conflict: "auth.errors.couldNotComplete",
  rateLimited: "auth.errors.rateLimited",
  generic: "auth.errors.generic",
  fieldErrorKey: (field) => `auth.errors.fields.${field || genericField}`,
});

/** Read a trimmed string field from FormData (never trust the client shape). */
function field(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function checkbox(form: FormData, name: string): boolean {
  return form.get(name) === "on" || form.get(name) === "true";
}

/** Resolve the tenant slug from the form, falling back to the default tenant. */
function resolveSlug(form: FormData): string {
  const fromForm = field(form, "organizationSlug");
  return fromForm.length > 0 ? fromForm : env.DEFAULT_ORG_SLUG;
}

// ── Login ───────────────────────────────────────────────────────────────────

export async function loginAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const locale = asLocale(field(form, "locale"));
  try {
    const meta = await getRequestMeta();
    const deps = buildAuthDeps(meta);
    const organizationId = await resolveOrganizationIdBySlug(prisma, resolveSlug(form));

    const credentials = {
      organizationId,
      email: field(form, "email"),
      password: (form.get("password") as string | null) ?? "",
      recaptchaToken: field(form, "recaptchaToken") || undefined,
    };

    // Pre-flight: rate limit + reCAPTCHA + credential check (throws on failure).
    await login(deps, credentials);

    // Establish the JWT session AND redirect atomically: `signIn` sets the
    // session cookie and throws a NEXT_REDIRECT to `redirectTo` (the localized
    // dashboard). Letting signIn own the redirect guarantees the Set-Cookie is
    // committed with the navigation — doing a separate redirect can race the
    // cookie write. The pre-flight already proved the credentials, so the
    // re-run of `authorize` inside signIn succeeds.
    const dashboardPath = locale === routing.defaultLocale ? "/dashboard" : `/${locale}/dashboard`;
    await signIn("credentials", {
      organizationId,
      email: credentials.email,
      password: credentials.password,
      redirectTo: dashboardPath,
    });
  } catch (error) {
    unstable_rethrow(error);
    return toActionState(error, errorKeys("email"));
  }

  // Unreachable in practice: signIn always throws (redirect on success, AuthError
  // on failure — the latter caught above). Kept for the function's return type.
  return ok();
}

// ── Register ──────────────────────────────────────────────────────────────────

export async function registerAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    // Both legal consents are mandatory; missing → field errors (no use case call).
    const acceptedPrivacy = checkbox(form, "consentPrivacy");
    const acceptedTerms = checkbox(form, "consentTerms");
    const fieldErrors: Record<string, string> = {};
    if (!acceptedPrivacy) fieldErrors.consentPrivacy = "auth.errors.fields.consentPrivacy";
    if (!acceptedTerms) fieldErrors.consentTerms = "auth.errors.fields.consentTerms";
    if (Object.keys(fieldErrors).length > 0) {
      return fail(undefined, fieldErrors);
    }

    const meta = await getRequestMeta();
    const deps = buildAuthDeps(meta);
    const organizationId = await resolveOrganizationIdBySlug(prisma, resolveSlug(form));

    await register(deps, {
      organizationId,
      name: field(form, "name"),
      email: field(form, "email"),
      password: (form.get("password") as string | null) ?? "",
      recaptchaToken: field(form, "recaptchaToken") || undefined,
      consents: [...registrationConsents()],
    });

    return ok("auth.register.success");
  } catch (error) {
    unstable_rethrow(error);
    return toActionState(error, errorKeys("email"));
  }
}

// ── Verify email ──────────────────────────────────────────────────────────────

export async function verifyEmailAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const meta = await getRequestMeta();
    const deps = buildAuthDeps(meta);
    await verifyEmail(deps, { token: field(form, "token") });
    return ok("auth.verifyEmail.success");
  } catch (error) {
    unstable_rethrow(error);
    return toActionState(error, errorKeys("token"));
  }
}

// ── Forgot password (request reset) ───────────────────────────────────────────

export async function requestPasswordResetAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const meta = await getRequestMeta();
    const deps = buildAuthDeps(meta);
    const organizationId = await resolveOrganizationIdBySlug(prisma, resolveSlug(form));

    // Always resolves to "accepted" regardless of whether the email exists
    // (non-revealing — the use case guarantees this).
    await requestPasswordReset(deps, {
      organizationId,
      email: field(form, "email"),
      recaptchaToken: field(form, "recaptchaToken") || undefined,
    });
    return ok("auth.forgotPassword.success");
  } catch (error) {
    unstable_rethrow(error);
    return toActionState(error, errorKeys("email"));
  }
}

// ── Reset password (with token) ───────────────────────────────────────────────

export async function resetPasswordAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const meta = await getRequestMeta();
    const deps = buildAuthDeps(meta);
    await resetPassword(deps, {
      token: field(form, "token"),
      newPassword: (form.get("newPassword") as string | null) ?? "",
    });
    return ok("auth.resetPassword.success");
  } catch (error) {
    unstable_rethrow(error);
    return toActionState(error, errorKeys("newPassword"));
  }
}
