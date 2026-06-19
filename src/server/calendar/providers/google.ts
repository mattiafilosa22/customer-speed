import { z } from "zod";

import { CalendarProviderType } from "@/generated/prisma/enums";
import { type HttpClient, readJson } from "@/server/calendar/http-client";
import {
  type AuthUrlRequest,
  type CalendarEvent,
  type CalendarEventInput,
  type CalendarProvider,
  type OAuthTokens,
} from "@/server/calendar/provider";

/**
 * Google Calendar provider (OAuth2 + bidirectional event sync, docs/08 Fase 6).
 *
 * All HTTP goes through the injected {@link HttpClient}, so unit tests drive it
 * with a fake (no real network). Tokens are returned in PLAINTEXT here; the
 * persistence layer encrypts them at rest (`src/lib/crypto.ts`).
 */

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const CALENDAR_API = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
const USERINFO_API = "https://openidconnect.googleapis.com/v1/userinfo";

/** Read/write events + the user's email (for lead matching). */
const SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "openid",
  "email",
] as const;

export interface GoogleProviderConfig {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly redirectUri: string;
}

// --- Upstream response shapes (validated at the boundary, docs/00 §2) --------

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1).optional(),
  expires_in: z.number().int().positive().optional(),
  scope: z.string().optional(),
});

const eventDateTimeSchema = z.object({
  dateTime: z.string().optional(),
  date: z.string().optional(),
});

const eventResourceSchema = z.object({
  id: z.string().min(1),
  status: z.string().optional(),
  summary: z.string().optional(),
  start: eventDateTimeSchema.optional(),
  end: eventDateTimeSchema.optional(),
  attendees: z
    .array(z.object({ email: z.string().optional() }))
    .optional(),
});

const eventsListSchema = z.object({
  items: z.array(eventResourceSchema).default([]),
});

const createdEventSchema = z.object({ id: z.string().min(1) });

const userInfoSchema = z.object({
  sub: z.string().min(1),
  email: z.string().optional(),
});

function toDate(dt: { dateTime?: string; date?: string } | undefined): Date | null {
  if (!dt) return null;
  const value = dt.dateTime ?? dt.date;
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function normalizeEvent(raw: z.infer<typeof eventResourceSchema>): CalendarEvent | null {
  const startAt = toDate(raw.start);
  if (!startAt) return null; // skip events without a usable start
  return {
    externalEventId: raw.id,
    title: raw.summary ?? "(no title)",
    startAt,
    endAt: toDate(raw.end),
    attendeeEmail: raw.attendees?.find((a) => a.email)?.email ?? null,
    canceled: raw.status === "cancelled",
  };
}

function form(params: Record<string, string>): string {
  return new URLSearchParams(params).toString();
}

function eventBody(input: CalendarEventInput): string {
  return JSON.stringify({
    summary: input.title,
    start: { dateTime: input.startAt.toISOString() },
    end: { dateTime: input.endAt.toISOString() },
    ...(input.attendeeEmail ? { attendees: [{ email: input.attendeeEmail }] } : {}),
  });
}

export function createGoogleCalendarProvider(
  config: GoogleProviderConfig,
  http: HttpClient,
): CalendarProvider {
  function authHeader(accessToken: string): Record<string, string> {
    return { Authorization: `Bearer ${accessToken}` };
  }

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
      expiresAt: parsed.expires_in
        ? new Date(Date.now() + parsed.expires_in * 1000)
        : null,
      scope: parsed.scope ?? SCOPES.join(" "),
    };
  }

  return {
    type: CalendarProviderType.GOOGLE,

    getAuthUrl(req: AuthUrlRequest): string {
      const url = new URL(AUTH_ENDPOINT);
      url.searchParams.set("client_id", config.clientId);
      url.searchParams.set("redirect_uri", config.redirectUri);
      url.searchParams.set("response_type", "code");
      url.searchParams.set("scope", SCOPES.join(" "));
      // offline + consent → guarantees a refresh_token on first connect.
      url.searchParams.set("access_type", "offline");
      url.searchParams.set("prompt", "consent");
      url.searchParams.set("include_granted_scopes", "true");
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

    async getAccountId(tokens: OAuthTokens): Promise<string | null> {
      const res = await http.request({
        method: "GET",
        url: USERINFO_API,
        headers: authHeader(tokens.accessToken),
      });
      const data = await readJson<unknown>(res);
      const info = userInfoSchema.parse(data);
      // The OIDC `sub` is the stable, non-reassignable account id.
      return info.sub;
    },

    async listEvents(
      accessToken: string,
      range: { from: Date; to: Date },
    ): Promise<CalendarEvent[]> {
      const url = new URL(CALENDAR_API);
      url.searchParams.set("timeMin", range.from.toISOString());
      url.searchParams.set("timeMax", range.to.toISOString());
      url.searchParams.set("singleEvents", "true");
      url.searchParams.set("orderBy", "startTime");
      const res = await http.request({
        method: "GET",
        url: url.toString(),
        headers: authHeader(accessToken),
      });
      const data = await readJson<unknown>(res);
      const { items } = eventsListSchema.parse(data);
      return items
        .map(normalizeEvent)
        .filter((e): e is CalendarEvent => e !== null);
    },

    async createEvent(
      accessToken: string,
      input: CalendarEventInput,
    ): Promise<{ externalEventId: string }> {
      const res = await http.request({
        method: "POST",
        url: CALENDAR_API,
        headers: { ...authHeader(accessToken), "Content-Type": "application/json" },
        body: eventBody(input),
      });
      const data = await readJson<unknown>(res);
      const { id } = createdEventSchema.parse(data);
      return { externalEventId: id };
    },

    async updateEvent(
      accessToken: string,
      externalEventId: string,
      input: CalendarEventInput,
    ): Promise<void> {
      const res = await http.request({
        method: "PATCH",
        url: `${CALENDAR_API}/${encodeURIComponent(externalEventId)}`,
        headers: { ...authHeader(accessToken), "Content-Type": "application/json" },
        body: eventBody(input),
      });
      await readJson<unknown>(res); // throws HttpError on non-2xx
    },

    async deleteEvent(accessToken: string, externalEventId: string): Promise<void> {
      const res = await http.request({
        method: "DELETE",
        url: `${CALENDAR_API}/${encodeURIComponent(externalEventId)}`,
        headers: authHeader(accessToken),
      });
      // 204 No Content (and Google's 410 "already deleted") are acceptable.
      if (!res.ok && res.status !== 410) {
        await readJson<unknown>(res); // surfaces the HttpError
      }
    },
  };
}
