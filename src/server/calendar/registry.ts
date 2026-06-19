import { CalendarProviderType } from "@/generated/prisma/enums";
import { type HttpClient, createFetchHttpClient } from "@/server/calendar/http-client";
import {
  type CalendarProvider,
  ProviderNotConfiguredError,
} from "@/server/calendar/provider";
import { readGoogleConfig, readCalendlyConfig } from "@/server/calendar/config";
import { createGoogleCalendarProvider } from "@/server/calendar/providers/google";
import { createCalendlyProvider } from "@/server/calendar/providers/calendly";

/**
 * Provider factory (DIP / Open-Closed, docs/00 §1).
 *
 * Builds a concrete {@link CalendarProvider} from env config + an injected
 * {@link HttpClient}. Consumers depend on this factory (and the interface), not
 * on the concrete provider modules. Adding Outlook later = a new case here + a
 * new module; no consumer changes.
 *
 * The HTTP client is a parameter so route handlers/use cases pass the real
 * `fetch` client in production and tests pass a fake (no real network).
 *
 * Returns `null` when the provider has no credentials (graceful degradation),
 * except {@link getProviderOrThrow} which raises {@link ProviderNotConfiguredError}
 * for code paths that already assume a configured provider.
 */
export function getProvider(
  type: CalendarProviderType,
  http: HttpClient = createFetchHttpClient(),
): CalendarProvider | null {
  switch (type) {
    case CalendarProviderType.GOOGLE: {
      const config = readGoogleConfig();
      return config ? createGoogleCalendarProvider(config, http) : null;
    }
    case CalendarProviderType.CALENDLY: {
      const config = readCalendlyConfig();
      return config ? createCalendlyProvider(config, http) : null;
    }
    default:
      return null;
  }
}

export function getProviderOrThrow(
  type: CalendarProviderType,
  http: HttpClient = createFetchHttpClient(),
): CalendarProvider {
  const provider = getProvider(type, http);
  if (!provider) {
    throw new ProviderNotConfiguredError(type);
  }
  return provider;
}
