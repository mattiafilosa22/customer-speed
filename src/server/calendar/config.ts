import { env } from "@/lib/env";
import { CalendarProviderType } from "@/generated/prisma/enums";
import type { GoogleProviderConfig } from "@/server/calendar/providers/google";
import type { CalendlyProviderConfig } from "@/server/calendar/providers/calendly";

/**
 * Provider configuration resolved from validated `env` (docs/06 §6.6).
 *
 * Every calendar credential is OPTIONAL: a tenant may have the
 * `calendarIntegrations` flag ON while the platform has not yet been provisioned
 * with OAuth keys. In that case the readers below return `null` and the UI shows
 * a "not configured" message instead of crashing (graceful degradation —
 * docs/08 Fase 6). The encryption key is additionally required to persist tokens
 * (we never store a token in plaintext).
 */

export function readGoogleConfig(): GoogleProviderConfig | null {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_REDIRECT_URI) {
    return null;
  }
  return {
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    redirectUri: env.GOOGLE_REDIRECT_URI,
  };
}

export function readCalendlyConfig(): CalendlyProviderConfig | null {
  if (
    !env.CALENDLY_CLIENT_ID ||
    !env.CALENDLY_CLIENT_SECRET ||
    !env.CALENDLY_REDIRECT_URI ||
    !env.CALENDLY_WEBHOOK_SIGNING_KEY
  ) {
    return null;
  }
  return {
    clientId: env.CALENDLY_CLIENT_ID,
    clientSecret: env.CALENDLY_CLIENT_SECRET,
    redirectUri: env.CALENDLY_REDIRECT_URI,
    webhookSigningKey: env.CALENDLY_WEBHOOK_SIGNING_KEY,
  };
}

/** True when the at-rest encryption key is present (required to store tokens). */
export function isEncryptionConfigured(): boolean {
  return Boolean(env.ENCRYPTION_KEY);
}

/**
 * Per-provider "is this provider usable right now?" — credentials AND the
 * encryption key (Google/Calendly OAuth both persist tokens). Used by the UI to
 * decide between "Connect" and "not configured".
 */
export function isProviderConfigured(provider: CalendarProviderType): boolean {
  if (!isEncryptionConfigured()) return false;
  switch (provider) {
    case CalendarProviderType.GOOGLE:
      return readGoogleConfig() !== null;
    case CalendarProviderType.CALENDLY:
      return readCalendlyConfig() !== null;
    default:
      return false;
  }
}
