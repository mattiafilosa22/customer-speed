import { NextRequest, NextResponse } from "next/server";
import createMiddleware from "next-intl/middleware";

import { routing } from "@/i18n/routing";
import { applySecurityHeaders, buildCsp, generateNonce } from "@/lib/security-headers";
import { basicAuthGate } from "@/lib/basic-auth";

/**
 * Composed middleware: next-intl (locale resolution/rewrite) + a fast auth
 * redirect first-line + security headers/CSP (docs/06 §6.4).
 *
 * Composition strategy (do NOT replace next-intl): we still delegate the actual
 * locale handling to `createMiddleware(routing)`, then decorate its response
 * with security headers and, where needed, a redirect. The AUTHORITATIVE auth
 * check is the server layout guard (`getSessionUser()` re-validates against the
 * DB); here we only do a cheap session-cookie presence check to bounce obvious
 * anonymous hits to protected areas early, without importing the (non
 * edge-safe) full auth stack.
 *
 * CSP uses a per-request nonce passed to the app via the `x-nonce` header; the
 * policy allows only the origins we need (self + Google reCAPTCHA). Inline
 * styles are still allowed for now (Tailwind/Next inject some) — tightening to a
 * fully nonce-based style-src is tracked for Fase 8 hardening.
 */

const intlMiddleware = createMiddleware(routing);

/** Auth.js v5 session cookie names (dev vs production __Secure- prefix). */
const SESSION_COOKIES = ["authjs.session-token", "__Secure-authjs.session-token"];

/** Locale-prefix-agnostic test for protected app paths. */
const PROTECTED_PREFIXES = [
  "/dashboard",
  "/pipeline",
  "/leads",
  "/appointments",
  "/settings",
];

function stripLocale(pathname: string): string {
  // Remove a leading "/en" (the only non-default prefix); "it" is prefix-less.
  for (const locale of routing.locales) {
    if (locale === routing.defaultLocale) continue;
    if (pathname === `/${locale}`) return "/";
    if (pathname.startsWith(`/${locale}/`)) return pathname.slice(locale.length + 1);
  }
  return pathname;
}

function hasSession(request: NextRequest): boolean {
  return SESSION_COOKIES.some((name) => Boolean(request.cookies.get(name)?.value));
}

function isProtected(pathname: string): boolean {
  const path = stripLocale(pathname);
  return PROTECTED_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
}

export default function middleware(request: NextRequest): NextResponse {
  // Temporary site-wide gate (enabled only when BASIC_AUTH_* env vars are set):
  // demand HTTP Basic credentials BEFORE anything else, so a reserved/staging
  // deployment isn't reachable (or indexable) by strangers. The app's own
  // login/RBAC/tenant isolation remain the real per-user security underneath.
  const gate = basicAuthGate(request);
  if (gate) return gate;

  const nonce = generateNonce();
  const csp = buildCsp(nonce, process.env.NODE_ENV !== "production");
  const { pathname } = request.nextUrl;

  // The admin area lives OUTSIDE `[locale]`: next-intl must NOT rewrite it (it
  // would try to map `/admin` to a locale route and 404). Pass it straight
  // through; the admin layout enforces the superAdmin guard. Still attach the
  // nonce + security headers.
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    const headers = new Headers(request.headers);
    headers.set("x-nonce", nonce);
    return applySecurityHeaders(NextResponse.next({ request: { headers } }), csp);
  }

  // Fast first-line redirect: anonymous hit to a protected area → login. The
  // layout still enforces this authoritatively (defense in depth).
  if (isProtected(pathname) && !hasSession(request)) {
    const loginUrl = request.nextUrl.clone();
    // Login lives under the (auth) group at the locale root; keep any locale
    // prefix already present so the redirect stays in the user's language.
    const localePrefix = pathname.startsWith("/en") ? "/en" : "";
    loginUrl.pathname = `${localePrefix}/login`;
    loginUrl.search = "";
    return applySecurityHeaders(NextResponse.redirect(loginUrl), csp);
  }

  // Pass the nonce down so Next can apply it to its scripts and the app can
  // attach it to any inline script if needed.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);

  // Let next-intl produce the response (rewrite/redirect for locale), then
  // decorate it with security headers. We forward the augmented request headers
  // so the nonce is available to downstream rendering.
  const response = intlMiddleware(new NextRequest(request, { headers: requestHeaders }));
  return applySecurityHeaders(response, csp);
}

export const config = {
  /**
   * Run on every path EXCEPT API/Next internals/static files. Mirrors the
   * next-intl matcher so locale handling is unchanged.
   */
  matcher: "/((?!api|trpc|_next|_vercel|.*\\..*).*)",
};
