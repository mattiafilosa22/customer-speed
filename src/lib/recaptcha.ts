import { env } from "@/lib/env";

/**
 * Server-side reCAPTCHA v3 verification (`docs/06` §6.2).
 *
 * The token from the client is verified against Google's siteverify API using
 * `RECAPTCHA_SECRET_KEY`; the v3 score is compared to `RECAPTCHA_MIN_SCORE`.
 *
 * Dev no-op: when the secret key is NOT configured, verification is skipped
 * (returns `outcome: "skipped"`) and a warning is logged, so local development
 * works without Google keys. In production the key SHOULD be set; a missing key
 * there is a misconfiguration the deployment checklist must catch.
 *
 * Fallback: a low score returns `outcome: "low-score"`; the caller can then
 * require the v2 checkbox challenge (fallback documented in docs/06).
 *
 * The HTTP call is injected (`fetchImpl`) so the verifier is unit-testable
 * without network access (Dependency Inversion).
 */

const SITEVERIFY_URL = "https://www.google.com/recaptcha/api/siteverify";

export type RecaptchaOutcome = "ok" | "skipped" | "low-score" | "failed";

export interface RecaptchaVerification {
  readonly outcome: RecaptchaOutcome;
  readonly score?: number;
}

/** Minimal shape of Google's siteverify response we rely on. */
interface SiteVerifyResponse {
  success: boolean;
  score?: number;
  action?: string;
  "error-codes"?: string[];
}

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export interface VerifyRecaptchaDeps {
  readonly secretKey?: string;
  readonly minScore?: number;
  readonly fetchImpl?: FetchLike;
  readonly logger?: Pick<typeof console, "warn" | "error">;
}

export async function verifyRecaptcha(
  token: string | undefined | null,
  deps: VerifyRecaptchaDeps = {},
): Promise<RecaptchaVerification> {
  const secretKey = deps.secretKey ?? env.RECAPTCHA_SECRET_KEY;
  const minScore = deps.minScore ?? env.RECAPTCHA_MIN_SCORE;
  const logger = deps.logger ?? console;
  const fetchImpl: FetchLike = deps.fetchImpl ?? fetch;

  // Dev no-op: no key configured → skip verification with a loud warning.
  if (!secretKey) {
    logger.warn(
      "[recaptcha] RECAPTCHA_SECRET_KEY not set — skipping verification. " +
        "Set the key in production.",
    );
    return { outcome: "skipped" };
  }

  if (!token) {
    return { outcome: "failed" };
  }

  let data: SiteVerifyResponse;
  try {
    const body = new URLSearchParams({ secret: secretKey, response: token });
    const res = await fetchImpl(SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    data = (await res.json()) as SiteVerifyResponse;
  } catch (error: unknown) {
    logger.error("[recaptcha] verification request failed", error);
    return { outcome: "failed" };
  }

  if (!data.success) {
    return { outcome: "failed" };
  }

  const score = data.score;
  if (typeof score === "number" && score < minScore) {
    return { outcome: "low-score", score };
  }

  return { outcome: "ok", score };
}

/**
 * reCAPTCHA v2 (checkbox "I'm not a robot") verification — the FALLBACK used when
 * the v3 score is low (docs/06 §6.2). Unlike v3, the v2 siteverify response has
 * NO `score`: it is a binary success/failure, so the outcome is simpler.
 *
 * Outcomes:
 *   - "ok"      → Google confirmed the checkbox challenge (human).
 *   - "failed"  → token rejected / missing / network error.
 *   - "skipped" → the v2 secret is NOT configured. This mirrors the v3 dev no-op
 *                 so behaviour degrades coherently; callers decide what "skipped"
 *                 means in context (the use cases treat "v2 not configured" via an
 *                 explicit `recaptchaV2Enabled` flag, not via this outcome).
 *
 * The HTTP call is injected (`fetchImpl`) for unit tests without network.
 */
export type RecaptchaV2Outcome = "ok" | "failed" | "skipped";

export interface RecaptchaV2Verification {
  readonly outcome: RecaptchaV2Outcome;
}

export interface VerifyRecaptchaV2Deps {
  readonly secretKey?: string;
  readonly fetchImpl?: FetchLike;
  readonly logger?: Pick<typeof console, "warn" | "error">;
}

export async function verifyRecaptchaV2(
  token: string | undefined | null,
  deps: VerifyRecaptchaV2Deps = {},
): Promise<RecaptchaV2Verification> {
  const secretKey = deps.secretKey ?? env.RECAPTCHA_V2_SECRET_KEY;
  const logger = deps.logger ?? console;
  const fetchImpl: FetchLike = deps.fetchImpl ?? fetch;

  // No v2 secret configured → the fallback is unavailable; degrade like v3.
  if (!secretKey) {
    logger.warn(
      "[recaptcha] RECAPTCHA_V2_SECRET_KEY not set — v2 fallback unavailable. " +
        "Set the key to enable the checkbox challenge on low v3 scores.",
    );
    return { outcome: "skipped" };
  }

  if (!token) {
    return { outcome: "failed" };
  }

  let data: SiteVerifyResponse;
  try {
    const body = new URLSearchParams({ secret: secretKey, response: token });
    const res = await fetchImpl(SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    data = (await res.json()) as SiteVerifyResponse;
  } catch (error: unknown) {
    logger.error("[recaptcha] v2 verification request failed", error);
    return { outcome: "failed" };
  }

  return { outcome: data.success ? "ok" : "failed" };
}

/**
 * Single decision point for whether a reCAPTCHA outcome is acceptable on a
 * protected auth flow (register/login/forgot — docs/06 §6.1-6.2).
 *
 * Accepted:
 *   - "ok"      → human (score ≥ threshold), or the v2 fallback succeeded.
 *   - "skipped" → keys NOT configured (dev only). The verifier already logged a
 *                 loud warning; in production the deployment checklist must set
 *                 the keys, so "skipped" should not occur there.
 * Rejected:
 *   - "failed"    → Google rejected the token / network error / missing token.
 *   - "low-score" → bot-like score below the configured threshold.
 *
 * Keeping this in ONE place stops the per-flow drift the security review found
 * (some flows accepted "low-score"/"skipped" implicitly).
 */
export function isRecaptchaAccepted(outcome: RecaptchaOutcome): boolean {
  return outcome === "ok" || outcome === "skipped";
}
