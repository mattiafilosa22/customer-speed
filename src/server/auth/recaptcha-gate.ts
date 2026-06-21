import { RecaptchaV2RequiredError } from "@/lib/errors";
import { isRecaptchaAccepted } from "@/lib/recaptcha";
import type { AuthDeps } from "@/server/auth/deps";

/**
 * Shared reCAPTCHA gate for the auth flows (login / register / forgot), so the
 * combined v3 + v2-fallback decision lives in ONE place (docs/00 SOLID — single
 * responsibility, no per-flow drift; docs/06 §6.2).
 *
 * Decision (run AFTER the rate-limit, BEFORE any account lookup):
 *   1. v3 = verifyRecaptcha(token)
 *   2. "ok" | "skipped"  → "pass"
 *   3. "failed"          → "reject"
 *   4. "low-score":
 *        - v2 NOT configured (`recaptchaV2Enabled === false`) → "reject"
 *          (current behaviour, no regression)
 *        - v2 configured:
 *            · no v2 token            → throw RecaptchaV2RequiredError (challenge)
 *            · v2 token verifies "ok" → "pass"
 *            · otherwise              → throw RecaptchaV2RequiredError (re-challenge)
 *
 * Returns a coarse verdict ("pass" | "reject"); each flow maps "reject" to its
 * own NON-REVEALING failure (Unauthorized for login, Conflict for register, a
 * silent accepted-no-op for forgot). The v2 challenge is signalled by THROWING
 * `RecaptchaV2RequiredError` — it reveals nothing about the account (it is raised
 * before the lookup) and the form layer maps it to a dedicated state.
 */
export type RecaptchaVerdict = "pass" | "reject";

export async function recaptchaGate(
  deps: Pick<AuthDeps, "verifyRecaptcha" | "verifyRecaptchaV2" | "recaptchaV2Enabled">,
  tokens: { v3Token?: string; v2Token?: string },
): Promise<RecaptchaVerdict> {
  const v3 = await deps.verifyRecaptcha(tokens.v3Token, {});

  if (isRecaptchaAccepted(v3.outcome)) {
    return "pass";
  }
  if (v3.outcome === "failed") {
    return "reject";
  }

  // v3.outcome === "low-score" from here on.
  if (!deps.recaptchaV2Enabled) {
    // Fallback not configured → preserve the existing "reject" behaviour.
    return "reject";
  }

  if (!tokens.v2Token) {
    // The form must render the v2 widget and resubmit with a response.
    throw new RecaptchaV2RequiredError();
  }

  const v2 = await deps.verifyRecaptchaV2(tokens.v2Token, {});
  if (v2.outcome === "ok") {
    return "pass";
  }

  // "failed" or "skipped" (secret vanished mid-request): re-challenge rather than
  // silently letting a bot-scored request through.
  throw new RecaptchaV2RequiredError();
}
