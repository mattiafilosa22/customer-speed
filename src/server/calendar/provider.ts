import type { CalendarProviderType } from "@/generated/prisma/enums";

/**
 * `CalendarProvider` — the OPEN/CLOSED abstraction for third-party calendars
 * (docs/00 §1, docs/08 Fase 6). Consumers (OAuth route handlers, sync use cases,
 * webhook handler) depend ONLY on this interface; adding a provider (e.g. Outlook)
 * means a new implementation, never edits to the consumers.
 *
 * Each provider receives its HTTP access via an injected `HttpClient` (see
 * `http-client.ts`), so the whole surface is testable with a fake — no real
 * network in unit tests.
 *
 * Capability differences between providers (Google = full bidirectional CRUD;
 * Calendly = inbound webhook import only) are expressed by OPTIONAL methods
 * (Interface Segregation): a consumer checks for the method before using it
 * rather than depending on a method a provider cannot honor.
 */

/** Tokens returned by an OAuth code exchange / refresh, in PLAINTEXT. */
export interface OAuthTokens {
  readonly accessToken: string;
  /** Some providers omit a refresh token on re-consent; keep it optional. */
  readonly refreshToken?: string | null;
  /** Absolute expiry (UTC). Null when the provider issues non-expiring tokens. */
  readonly expiresAt?: Date | null;
  readonly scope?: string | null;
  /**
   * Stable account id when the token response already carries it (e.g. Calendly
   * `owner` URI). Avoids a second round-trip; `getAccountId` may also derive it.
   */
  readonly accountId?: string | null;
}

/** A normalized calendar event, provider-agnostic. */
export interface CalendarEvent {
  readonly externalEventId: string;
  readonly title: string;
  readonly startAt: Date;
  readonly endAt?: Date | null;
  /** Attendee/invitee email, used to match a lead by email (docs/08 Fase 6). */
  readonly attendeeEmail?: string | null;
  /** True when the event was canceled upstream (drives status sync). */
  readonly canceled?: boolean;
}

/** Input to create/update a provider event from a local appointment. */
export interface CalendarEventInput {
  readonly title: string;
  readonly startAt: Date;
  readonly endAt: Date;
  readonly attendeeEmail?: string | null;
}

/** Authorization-URL request: provider builds the consent URL with our `state`. */
export interface AuthUrlRequest {
  /** Opaque CSRF token; the callback verifies it matches the cookie. */
  readonly state: string;
}

/** Result of verifying + parsing an inbound webhook. */
export interface ParsedWebhook {
  /**
   * Stable id used to correlate the webhook to a `CalendarConnection`. For
   * Calendly this is the organization/user URI in the payload; the handler maps
   * it to a connection it OWNS (never trusting the payload for the tenant).
   */
  readonly providerAccountId: string | null;
  /** The events carried by the webhook (created/updated/canceled). */
  readonly events: readonly CalendarEvent[];
}

export interface WebhookVerificationInput {
  readonly rawBody: string;
  readonly headers: Readonly<Record<string, string>>;
}

/**
 * The provider port. `connect`/CRUD/`refresh` are optional so a webhook-only
 * provider (Calendly) does not have to fake methods it cannot implement.
 */
export interface CalendarProvider {
  readonly type: CalendarProviderType;

  /** Build the OAuth consent URL (Authorization Code flow). */
  getAuthUrl(req: AuthUrlRequest): string;

  /** Exchange an authorization `code` for tokens. */
  exchangeCode(code: string): Promise<OAuthTokens>;

  /**
   * Resolve the STABLE account id of the connected account (Google `sub`/email,
   * Calendly user URI). Persisted as `CalendarConnection.providerAccountId` and
   * used to map inbound webhooks to the owning connection/tenant securely. Not a
   * secret. Returns null when the provider cannot supply one.
   */
  getAccountId?(tokens: OAuthTokens): Promise<string | null>;

  /** Refresh an expired access token using a refresh token. */
  refreshTokens?(refreshToken: string): Promise<OAuthTokens>;

  /** List events in a time window (pull/import). */
  listEvents?(accessToken: string, range: { from: Date; to: Date }): Promise<CalendarEvent[]>;

  /** Push: create an event; returns the external id to persist. */
  createEvent?(accessToken: string, input: CalendarEventInput): Promise<{ externalEventId: string }>;

  /** Push: update an existing event. */
  updateEvent?(
    accessToken: string,
    externalEventId: string,
    input: CalendarEventInput,
  ): Promise<void>;

  /** Push: delete an event. */
  deleteEvent?(accessToken: string, externalEventId: string): Promise<void>;

  /**
   * Verify the webhook signature AND parse it. Throws `WebhookVerificationError`
   * on an invalid/missing signature (→ 401). Webhook-only providers implement
   * this; OAuth-push providers may omit it.
   */
  parseWebhook?(input: WebhookVerificationInput): ParsedWebhook;
}

/** Raised when a webhook signature is missing/invalid (handler maps to 401). */
export class WebhookVerificationError extends Error {
  readonly status = 401 as const;
  constructor(message = "Invalid webhook signature") {
    super(message);
    this.name = "WebhookVerificationError";
  }
}

/** Raised when a provider is enabled by flag but missing its OAuth credentials. */
export class ProviderNotConfiguredError extends Error {
  constructor(provider: CalendarProviderType) {
    super(`Calendar provider ${provider} is not configured (missing credentials)`);
    this.name = "ProviderNotConfiguredError";
  }
}
