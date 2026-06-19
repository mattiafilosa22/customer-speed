import type { NextResponse } from "next/server";

/**
 * Security headers + CSP (docs/06 §6.4).
 *
 * Origins allowed are the minimum needed today:
 *  - `'self'` for the app,
 *  - Google reCAPTCHA (`https://www.google.com`, `https://www.gstatic.com`) for
 *    the v3 script + its frame/connect.
 *
 * Hardening status (Fase 8):
 *  - `script-src` carries a per-request nonce + `'strict-dynamic'` and NO
 *    `'unsafe-inline'`: with `'strict-dynamic'` a browser trusts scripts loaded
 *    by a nonce'd script, which covers Next's runtime and the reCAPTCHA loader
 *    (the Google origins are listed only as a fallback for non-strict-dynamic
 *    browsers, which ignore them when a nonce is present). `'unsafe-eval'` is
 *    added ONLY in dev (React Fast Refresh); production stays strict.
 *  - `style-src` keeps `'unsafe-inline'` DELIBERATELY: Next.js injects inline
 *    `<style>` for its CSS runtime / Fast Refresh and does NOT expose a hook to
 *    attach our per-request nonce to those tags (there is no public
 *    style-nonce API in the App Router today). Using a nonce here would break
 *    styling. The residual risk is low — a style-only injection cannot exfiltrate
 *    data or run code, and `script-src` (the XSS-relevant directive) is strict.
 *    Tracked to revisit if/when Next exposes a style nonce. (See RESIDUAL RISK.)
 *  - `upgrade-insecure-requests` is added in PRODUCTION so any stray http://
 *    subresource is fetched over https; omitted in dev (local http).
 *  - HSTS is emitted always; honored only over HTTPS, harmless in local HTTP dev.
 */

export function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  // base64 without Buffer (edge runtime safe).
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

export function buildCsp(nonce: string, isDev = false): string {
  // Next.js + React Fast Refresh use eval() in DEVELOPMENT only (and React
  // never uses eval in production). Allow 'unsafe-eval' in dev so the dev
  // runtime + Server Action client dispatch work; production stays strict.
  const devScript = isDev ? ["'unsafe-eval'"] : [];
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    // reCAPTCHA v3 script + Next runtime via nonce + strict-dynamic.
    "script-src": [
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      "https://www.google.com",
      "https://www.gstatic.com",
      ...devScript,
    ],
    // 'unsafe-inline' kept deliberately for Next's runtime inline styles — see
    // the module docblock (RESIDUAL RISK). script-src stays strict (the
    // XSS-relevant directive); style-only injection cannot run code.
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "https://www.gstatic.com", "https://www.google.com"],
    "font-src": ["'self'", "data:"],
    // reCAPTCHA siteverify is server-side; the client connects to Google for the
    // challenge assets. The calendar OAuth/API calls are server-to-server, so no
    // browser connect origin is needed for them.
    "connect-src": ["'self'", "https://www.google.com", "https://www.gstatic.com"],
    // reCAPTCHA renders an invisible challenge in a Google frame; Calendly may be
    // embedded as a scheduling widget iframe (Fase 6, opt-in).
    "frame-src": ["'self'", "https://www.google.com", "https://calendly.com"],
    // Clickjacking protection (modern equivalent of X-Frame-Options).
    "frame-ancestors": ["'none'"],
    "base-uri": ["'self'"],
    // The integrations "Connect" control navigates the top-level browser to the
    // provider consent screens (OAuth Authorization Code). Allow those origins as
    // navigation/form targets so the redirect is not blocked (Fase 6).
    "form-action": [
      "'self'",
      "https://accounts.google.com",
      "https://auth.calendly.com",
    ],
    "object-src": ["'none'"],
    // TODO (infra): add a report endpoint (report-to / report-uri) once a
    // reporting sink exists (e.g. Sentry CSP reporting).
  };

  const serialized = Object.entries(directives)
    .map(([key, values]) => `${key} ${values.join(" ")}`)
    .join("; ");

  // Valueless directive: force any stray http:// subresource onto https in
  // production. Omitted in dev (local http) so the dev server is not upgraded.
  return isDev ? serialized : `${serialized}; upgrade-insecure-requests`;
}

/**
 * Apply the standard security headers + the given CSP to a response. Mutates and
 * returns the same response for chaining.
 */
export function applySecurityHeaders(response: NextResponse, csp: string): NextResponse {
  const headers: Record<string, string> = {
    "Content-Security-Policy": csp,
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    // Redundant with CSP frame-ancestors but kept for older browsers.
    "X-Frame-Options": "DENY",
    // Lock down powerful features we don't use.
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), browsing-topics=()",
    // 2 years, include subdomains, preload-eligible. Honored only over HTTPS.
    "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  };
  for (const [key, value] of Object.entries(headers)) {
    response.headers.set(key, value);
  }
  return response;
}
