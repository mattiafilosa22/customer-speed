import { createHmac, timingSafeEqual } from "node:crypto";

import { z } from "zod";

import { CalendarProviderType } from "@/generated/prisma/enums";
import { type HttpClient, readJson } from "@/server/calendar/http-client";
import {
  type AuthUrlRequest,
  type CalendarEvent,
  type CalendarProvider,
  type OAuthTokens,
  type ParsedWebhook,
  type WebhookVerificationInput,
  WebhookVerificationError,
} from "@/server/calendar/provider";

/**
 * Calendly provider (docs/08 Fase 6).
 *
 * Calendly is INBOUND-ONLY in our model: we do not push events to it. Its value
 * is the webhook (`invitee.created` / `invitee.canceled`) which we import into
 * local `Appointment` rows, matching a lead by the invitee email.
 *
 * Implemented surface:
 *  - `getAuthUrl` / `exchangeCode` / `refreshTokens`: standard OAuth2 (used to
 *    obtain a token to register webhook subscriptions / read org info later).
 *  - `parseWebhook`: VERIFIES the `Calendly-Webhook-Signature` HMAC (docs/06
 *    §6.4) and parses the payload into normalized events. An invalid/missing
 *    signature throws {@link WebhookVerificationError} (→ 401).
 *
 * `listEvents`/`createEvent`/`updateEvent`/`deleteEvent` are intentionally
 * OMITTED (Interface Segregation): the consumer never calls them for Calendly.
 *
 * All HTTP goes through the injected {@link HttpClient}; the signature check is
 * pure crypto (no network), so the whole surface is unit-testable with a fake.
 */

const AUTH_ENDPOINT = "https://auth.calendly.com/oauth/authorize";
const TOKEN_ENDPOINT = "https://auth.calendly.com/oauth/token";
const DEFAULT_SCOPE = "default";

export interface CalendlyProviderConfig {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly redirectUri: string;
  /** Webhook signing key used to verify `Calendly-Webhook-Signature`. */
  readonly webhookSigningKey: string;
}

// --- Upstream shapes (validated at the boundary, docs/00 §2) -----------------

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1).optional(),
  expires_in: z.number().int().positive().optional(),
  scope: z.string().optional(),
  owner: z.string().optional(),
  organization: z.string().optional(),
});

/**
 * Calendly v2 webhook payload (the subset we consume). `payload.scheduled_event`
 * carries the time window + the event URI (our stable external id); `payload`
 * carries the invitee email. `created_by`/`payload.organization` identify the
 * Calendly org/user the subscription belongs to — used ONLY to correlate to a
 * connection we own, never to trust the tenant from the wire.
 */
const webhookEventSchema = z.object({
  event: z.string(), // "invitee.created" | "invitee.canceled"
  payload: z.object({
    email: z.string().optional(),
    status: z.string().optional(),
    uri: z.string().optional(),
    name: z.string().optional(),
    scheduled_event: z
      .object({
        uri: z.string().optional(),
        name: z.string().optional(),
        start_time: z.string().optional(),
        end_time: z.string().optional(),
      })
      .optional(),
  }),
  created_by: z.string().optional(),
});

const INVITEE_CREATED = "invitee.created";
const INVITEE_CANCELED = "invitee.canceled";

function form(params: Record<string, string>): string {
  return new URLSearchParams(params).toString();
}

function parseDate(value: string | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Parse the `Calendly-Webhook-Signature` header. Calendly sends
 * `t=<timestamp>,v1=<hexHmac>` (Stripe-style). We accept either that form or a
 * bare hex/base64 hmac for forward-compat with the signing scheme.
 */
function extractSignature(header: string | undefined): { signedPayloadPrefix: string; v1: string } | null {
  if (!header) return null;
  const parts = header.split(",").map((p) => p.trim());
  let timestamp: string | null = null;
  let v1: string | null = null;
  for (const part of parts) {
    const [key, value] = part.split("=");
    if (key === "t") timestamp = value ?? null;
    if (key === "v1") v1 = value ?? null;
  }
  if (timestamp && v1) {
    return { signedPayloadPrefix: `${timestamp}.`, v1 };
  }
  // Bare signature (no scheme): treat the whole header as v1, no timestamp.
  const bare = parts[0];
  if (parts.length === 1 && bare && bare.length > 0) {
    return { signedPayloadPrefix: "", v1: bare };
  }
  return null;
}

/** Constant-time compare of two hex strings (avoids timing side-channels). */
function safeHexEqual(a: string, b: string): boolean {
  let bufA: Buffer;
  let bufB: Buffer;
  try {
    bufA = Buffer.from(a, "hex");
    bufB = Buffer.from(b, "hex");
  } catch {
    return false;
  }
  if (bufA.length === 0 || bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function createCalendlyProvider(
  config: CalendlyProviderConfig,
  http: HttpClient,
): CalendarProvider {
  async function exchange(params: Record<string, string>): Promise<OAuthTokens> {
    const res = await http.request({
      method: "POST",
      url: TOKEN_ENDPOINT,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form(params),
    });
    const data = await readJson<unknown>(res);
    const parsed = tokenResponseSchema.parse(data);
    return {
      accessToken: parsed.access_token,
      refreshToken: parsed.refresh_token ?? null,
      expiresAt: parsed.expires_in ? new Date(Date.now() + parsed.expires_in * 1000) : null,
      scope: parsed.scope ?? DEFAULT_SCOPE,
      // `owner` is the Calendly user URI; it equals the webhook `created_by`, so
      // we persist it as `providerAccountId` to map inbound webhooks securely.
      accountId: parsed.owner ?? parsed.organization ?? null,
    };
  }

  return {
    type: CalendarProviderType.CALENDLY,

    getAuthUrl(req: AuthUrlRequest): string {
      const url = new URL(AUTH_ENDPOINT);
      url.searchParams.set("client_id", config.clientId);
      url.searchParams.set("redirect_uri", config.redirectUri);
      url.searchParams.set("response_type", "code");
      url.searchParams.set("state", req.state);
      return url.toString();
    },

    exchangeCode(code: string): Promise<OAuthTokens> {
      return exchange({
        code,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: config.redirectUri,
        grant_type: "authorization_code",
      });
    },

    refreshTokens(refreshToken: string): Promise<OAuthTokens> {
      return exchange({
        refresh_token: refreshToken,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        grant_type: "refresh_token",
      });
    },

    getAccountId(tokens: OAuthTokens): Promise<string | null> {
      // Already carried by the token exchange (`owner` URI).
      return Promise.resolve(tokens.accountId ?? null);
    },

    parseWebhook(input: WebhookVerificationInput): ParsedWebhook {
      // 1) Verify the HMAC signature BEFORE touching the body semantically.
      const header =
        input.headers["calendly-webhook-signature"] ??
        input.headers["Calendly-Webhook-Signature"];
      const sig = extractSignature(header);
      if (!sig) {
        throw new WebhookVerificationError("Missing webhook signature");
      }
      const expected = createHmac("sha256", config.webhookSigningKey)
        .update(`${sig.signedPayloadPrefix}${input.rawBody}`)
        .digest("hex");
      if (!safeHexEqual(expected, sig.v1)) {
        throw new WebhookVerificationError("Webhook signature mismatch");
      }

      // 2) Only now parse the (authenticated) body.
      let json: unknown;
      try {
        json = JSON.parse(input.rawBody);
      } catch {
        throw new WebhookVerificationError("Invalid webhook body");
      }
      const parsed = webhookEventSchema.safeParse(json);
      if (!parsed.success) {
        // Body authenticated but unexpected shape → no events (ignored), not an
        // auth failure. The handler treats an empty event list as a 200 no-op.
        return { providerAccountId: null, events: [] };
      }

      const body = parsed.data;
      const scheduled = body.payload.scheduled_event;
      const startAt = parseDate(scheduled?.start_time);
      const externalEventId = scheduled?.uri ?? body.payload.uri ?? null;
      if (!startAt || !externalEventId) {
        return { providerAccountId: body.created_by ?? null, events: [] };
      }

      const canceled =
        body.event === INVITEE_CANCELED || body.payload.status === "canceled";

      const event: CalendarEvent = {
        externalEventId,
        title: scheduled?.name ?? body.payload.name ?? "Calendly",
        startAt,
        endAt: parseDate(scheduled?.end_time),
        attendeeEmail: body.payload.email ?? null,
        canceled,
      };

      // `created_by` is the Calendly user URI that owns the subscription. The
      // handler maps it to a connection IT OWNS (per-user/tenant), so the wire
      // can never select the tenant (docs/08 Fase 6 "mapping tenant sicuro").
      return {
        providerAccountId: body.created_by ?? null,
        events: body.event === INVITEE_CREATED || canceled ? [event] : [],
      };
    },
  };
}
