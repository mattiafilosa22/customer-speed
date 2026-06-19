/**
 * Public surface of the calendar integration module (Fase 6). Route handlers,
 * Server Actions and pages import from here; the concrete provider modules and
 * the crypto/HTTP plumbing stay internal (docs/00 §1).
 */
export type {
  CalendarProvider,
  CalendarEvent,
  CalendarEventInput,
  OAuthTokens,
  ParsedWebhook,
} from "@/server/calendar/provider";
export {
  WebhookVerificationError,
  ProviderNotConfiguredError,
} from "@/server/calendar/provider";

export { getProvider, getProviderOrThrow } from "@/server/calendar/registry";
export {
  isProviderConfigured,
  isEncryptionConfigured,
  readGoogleConfig,
  readCalendlyConfig,
} from "@/server/calendar/config";

export { requireCalendarContext } from "@/server/calendar/route-guard";
export {
  buildConnectionStore,
  buildWebhookConnectionStore,
  buildAudit,
} from "@/server/calendar/context-deps";
export {
  createConnectionStore,
  type CalendarConnectionStore,
  type DecryptedConnection,
} from "@/server/calendar/connection-store";

export {
  getIntegrationStatus,
  SUPPORTED_PROVIDERS,
  type ProviderStatus,
} from "@/server/calendar/connection-status";

export { handleVerifiedWebhook } from "@/server/calendar/webhook-import";
export { importEvents } from "@/server/calendar/sync/import-events";
export {
  pushCreatedAppointment,
  pushUpdatedAppointment,
  pushDeletedAppointment,
  type OutboundDeps,
} from "@/server/calendar/sync/outbound";
export { buildOutboundDeps } from "@/server/calendar/outbound-deps";
