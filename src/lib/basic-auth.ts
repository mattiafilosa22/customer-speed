import { NextResponse, type NextRequest } from "next/server";

/**
 * HTTP Basic Auth — a temporary, site-wide gate in front of the whole app
 * (a single shared username/password the browser prompts for), used while the
 * deployment is reserved (e.g. only Fabio should reach it) and not yet public.
 *
 * It is layered BEFORE the application's own auth (login/RBAC/tenant isolation),
 * which stays the real, per-user security. This is just a coarse "keep strangers
 * and crawlers out" barrier.
 *
 * ENABLED ONLY when BOTH `BASIC_AUTH_USER` and `BASIC_AUTH_PASSWORD` are set
 * (so local dev and any unconfigured env are NOT gated). Reads `process.env`
 * directly — not the Zod `env` module — to stay edge-runtime safe (this runs in
 * `middleware.ts`). When the deployment goes fully public, just remove the two
 * env vars and the gate disappears with no code change.
 */

/** Length-aware constant-time string compare (avoids trivial timing leaks). */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

function decodeCredentials(header: string | null): { user: string; pass: string } | null {
  if (!header?.startsWith("Basic ")) return null;
  let decoded: string;
  try {
    decoded = atob(header.slice("Basic ".length).trim());
  } catch {
    return null;
  }
  const sep = decoded.indexOf(":");
  if (sep === -1) return null;
  return { user: decoded.slice(0, sep), pass: decoded.slice(sep + 1) };
}

/**
 * Returns a 401 response demanding Basic credentials when the gate is enabled
 * and the request is unauthenticated; returns `null` when the gate is disabled
 * or the credentials are valid (caller proceeds with the normal pipeline).
 */
export function basicAuthGate(request: NextRequest): NextResponse | null {
  const expectedUser = process.env.BASIC_AUTH_USER;
  const expectedPass = process.env.BASIC_AUTH_PASSWORD;

  // Gate disabled unless BOTH are configured.
  if (!expectedUser || !expectedPass) return null;

  const creds = decodeCredentials(request.headers.get("authorization"));
  if (
    creds &&
    timingSafeEqual(creds.user, expectedUser) &&
    timingSafeEqual(creds.pass, expectedPass)
  ) {
    return null; // authorized
  }

  return new NextResponse("Authentication required.", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="CustomerSpeed", charset="UTF-8"',
      // Never let a 401 gate page be cached/indexed.
      "Cache-Control": "no-store",
    },
  });
}
