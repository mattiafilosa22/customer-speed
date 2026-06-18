"use server";

import { cookies } from "next/headers";

import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import {
  COOKIE_CONSENT_NAME,
  CONSENT_MAX_AGE_SECONDS,
  type CookieConsentState,
} from "@/lib/cookie-consent";
import {
  COOKIE_POLICY_VERSION,
  CONSENT_TYPES,
} from "@/server/consent/consent-types";
import { getRequestMeta } from "@/server/actions/request-meta";
import { getSessionUser } from "@/server/auth/guards";

/**
 * Persist a cookie-consent choice (Garante "proof of consent", docs/09 §9.3).
 *
 * Two records of the decision:
 *  1. AUTHORITATIVE: `Consent` rows (one per category) with version, timestamp,
 *     IP and user-agent — the audit-grade proof. `userId` is set when a session
 *     exists, otherwise null (an anonymous visitor on the public site).
 *  2. CLIENT MIRROR: a first-party cookie carrying the same choice, read to
 *     decide whether to re-prompt (necessary cookie, no consent required).
 *
 * `organizationId` MUST match the `userId`'s tenant to avoid a cross-tenant mix:
 *   - AUTHENTICATED visitor → the user's OWN tenant (`getSessionUser().organizationId`),
 *     so the `Consent.userId` FK and `Consent.organizationId` always agree.
 *   - ANONYMOUS visitor (no session) → the neutral PLATFORM tenant
 *     (`DEFAULT_ORG_SLUG`), which owns the public site; `userId` is null.
 * The boolean is sanitized server-side; "necessary" is always granted.
 *
 * No throw on the audit write failing the user flow — the cookie still gets set
 * so the user is not stuck — but errors are logged for diagnosis.
 */
export async function saveCookieConsentAction(analyticsAllowed: boolean): Promise<void> {
  const analytics = analyticsAllowed === true;
  const decidedAt = new Date();

  const state: CookieConsentState = {
    necessary: true,
    analytics,
    version: COOKIE_POLICY_VERSION,
    decidedAt: decidedAt.toISOString(),
  };

  // 1) Client mirror cookie (httpOnly so it can't be tampered with by scripts;
  // SameSite=Lax; Secure in production). Read back server-side on next render.
  const store = await cookies();
  store.set(COOKIE_CONSENT_NAME, JSON.stringify(state), {
    httpOnly: true,
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
    path: "/",
    maxAge: CONSENT_MAX_AGE_SECONDS,
  });

  // 2) Authoritative proof-of-consent rows.
  try {
    const meta = await getRequestMeta();
    const user = await getSessionUser();
    // Coherence rule: an authenticated user's consent belongs to THEIR tenant
    // (the userId FK and organizationId must agree); an anonymous visitor's
    // consent belongs to the neutral platform tenant. Never mix the two.
    const organizationId = user
      ? user.organizationId
      : await resolvePlatformOrgId();
    if (organizationId) {
      await prisma.consent.createMany({
        data: [
          {
            organizationId,
            userId: user?.id ?? null,
            type: CONSENT_TYPES.cookieNecessary,
            granted: true,
            version: COOKIE_POLICY_VERSION,
            ip: meta.ip,
            userAgent: meta.userAgent,
          },
          {
            organizationId,
            userId: user?.id ?? null,
            type: CONSENT_TYPES.cookieAnalytics,
            granted: analytics,
            version: COOKIE_POLICY_VERSION,
            ip: meta.ip,
            userAgent: meta.userAgent,
          },
        ],
      });
    }
  } catch (error) {
    console.error("[cookie-consent] failed to record proof of consent", error);
  }
}

/** Resolve the neutral platform tenant id for anonymous consent; null if unresolved. */
async function resolvePlatformOrgId(): Promise<string | null> {
  const org = await prisma.organization.findUnique({
    where: { slug: env.DEFAULT_ORG_SLUG },
    select: { id: true },
  });
  return org?.id ?? null;
}
