import type { NextResponse } from "next/server";

/**
 * Security headers + CSP (docs/06 §6.4).
 *
 * Origins allowed are the minimum needed today:
 *  - `'self'` for the app,
 *  - Google reCAPTCHA (`https://www.google.com`, `https://www.gstatic.com`) for
 *    the v3 script + its frame/connect.
 *
 * Pragmatic notes (Fase 1):
 *  - `script-src` includes a per-request nonce AND `'strict-dynamic'`; for the
 *    reCAPTCHA bootstrap we also allow the Google origins. Next.js/React inject
 *    some inline bootstrap; with `'strict-dynamic'` modern browsers trust
 *    scripts loaded by nonce'd scripts, which covers Next's runtime.
 *  - `style-src` still allows `'unsafe-inline'`: Tailwind v4 + Next inject inline
 *    styles and styled nonces are not wired yet. Tightening style-src to a nonce
 *    is tracked for Fase 8.
 *  - HSTS is emitted always; it is only honored over HTTPS, so it is harmless in
 *    local HTTP dev.
 *
 * See `FASE 8` notes in the function body for the remaining hardening backlog.
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
    // FASE 8: replace 'unsafe-inline' with nonces/hashes for styles.
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
    // FASE 8: add `upgrade-insecure-requests` and a report endpoint
    // (report-to / report-uri) once a reporting sink exists.
  };

  return Object.entries(directives)
    .map(([key, values]) => `${key} ${values.join(" ")}`)
    .join("; ");
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
