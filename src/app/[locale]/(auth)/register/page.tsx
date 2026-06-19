import { notFound } from "next/navigation";

/**
 * Public self-registration is DISABLED in Fase 1 (security review decision).
 *
 * Tenants (Organizations) are provisioned by the superAdmin / reseller, and
 * users are created via internal onboarding / invitation, NOT by anonymous
 * public signup (docs/02 §2.1, docs/08). An open `/register` would let anyone
 * create a `baseUser` inside a real customer tenant — an unwanted attack/abuse
 * surface and a tenant-data concern.
 *
 * The `register` USE CASE (`@/server/auth`) and `registerAction` remain intact
 * for internal/invite/seed flows and stay fully tested; only the PUBLIC page is
 * closed. When invitation-based onboarding lands, this page is replaced by an
 * invite-scoped form instead of being re-opened to anonymous visitors.
 *
 * `notFound()` (404) is the least-revealing response: it does not advertise that
 * a registration endpoint ever existed.
 */
export default function RegisterPage(): never {
  notFound();
}
