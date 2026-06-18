import { handlers } from "@/lib/auth";

/**
 * Auth.js (NextAuth v5) route handler. Lives OUTSIDE the `[locale]` segment so
 * the callback/session endpoints are locale-agnostic.
 */
export const { GET, POST } = handlers;
