import { initObservability } from "@/lib/observability";

/**
 * Next.js instrumentation hook (runs once at server startup, both Node and Edge
 * runtimes). We use it solely to bootstrap observability (Fase 8, docs/06 §6.4).
 *
 * It is a NO-OP unless `SENTRY_DSN` is set AND the Sentry SDK has been wired in
 * `src/lib/observability.ts` — so a fresh deploy without an observability
 * account boots cleanly. See the infra checklist in README / docs/06.
 */
export function register(): void {
  initObservability();
}
