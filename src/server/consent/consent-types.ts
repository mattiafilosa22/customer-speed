/**
 * Versioned consent identifiers — the single source of truth for the `type` and
 * `version` written to the `Consent` model (proof of consent, docs/06 §6.5,
 * docs/09 §9.3). Bumping a document's text MUST bump its version here so new
 * consents are recorded and the cookie banner can re-prompt when the version
 * changes (docs/09 §9.3: re-prompt only if conditions changed or > 180 days).
 *
 * These are stable machine identifiers, NOT user-facing copy (that lives in the
 * i18n catalogues). The legal page versions mirror `legal.*.version` labels.
 */

/** Current versions of the legal documents, mirrored in the page content. */
export const PRIVACY_POLICY_VERSION = "v1";
export const TERMS_VERSION = "v1";
export const COOKIE_POLICY_VERSION = "v1";

/** Consent `type` keys recorded at registration. */
export const CONSENT_TYPES = {
  privacyPolicy: "privacy_policy",
  terms: "terms",
  /** Cookie categories — analytics is the only optional one for now. */
  cookieNecessary: "cookie_necessary",
  cookieAnalytics: "cookie_analytics",
} as const;

export type ConsentType = (typeof CONSENT_TYPES)[keyof typeof CONSENT_TYPES];

/**
 * The registration consents the user must explicitly grant: privacy policy and
 * terms of service. Built versioned so the use case records exact proof.
 */
export function registrationConsents(): ReadonlyArray<{
  type: ConsentType;
  version: string;
  granted: boolean;
}> {
  return [
    { type: CONSENT_TYPES.privacyPolicy, version: PRIVACY_POLICY_VERSION, granted: true },
    { type: CONSENT_TYPES.terms, version: TERMS_VERSION, granted: true },
  ];
}
