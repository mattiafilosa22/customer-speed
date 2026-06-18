import { headers } from "next/headers";

/**
 * Best-effort extraction of the client IP and user-agent inside a Server Action
 * / Route Handler, for audit + consent records and IP-keyed rate limiting
 * (docs/06 §6.1, §6.4).
 *
 * IP: read from the standard proxy headers Vercel/most CDNs set. We take the
 * FIRST hop of `x-forwarded-for` (the original client) and fall back to
 * `x-real-ip`. When absent (e.g. local dev), returns null — the rate limiter
 * keys on "unknown", which is acceptable for dev.
 */
export interface RequestMeta {
  readonly ip: string | null;
  readonly userAgent: string | null;
}

export async function getRequestMeta(): Promise<RequestMeta> {
  const h = await headers();
  const forwardedFor = h.get("x-forwarded-for");
  const ip = forwardedFor
    ? (forwardedFor.split(",")[0]?.trim() ?? null)
    : h.get("x-real-ip");
  const userAgent = h.get("user-agent");
  return { ip: ip ?? null, userAgent: userAgent ?? null };
}
