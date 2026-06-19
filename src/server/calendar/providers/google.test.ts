import { describe, expect, it } from "vitest";

import { CalendarProviderType } from "@/generated/prisma/enums";
import { createGoogleCalendarProvider, type GoogleProviderConfig } from "@/server/calendar/providers/google";
import { createFakeHttp, jsonHttp } from "@/server/calendar/test-http";

const config: GoogleProviderConfig = {
  clientId: "client-123",
  clientSecret: "secret-xyz",
  redirectUri: "https://app.example.com/api/integrations/google/callback",
};

describe("GoogleCalendarProvider", () => {
  it("builds an auth URL carrying the state, scopes and offline/consent params", () => {
    const provider = createGoogleCalendarProvider(config, jsonHttp({}));
    const url = new URL(provider.getAuthUrl({ state: "csrf-state-abc" }));

    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("client_id")).toBe("client-123");
    expect(url.searchParams.get("redirect_uri")).toBe(config.redirectUri);
    expect(url.searchParams.get("state")).toBe("csrf-state-abc");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(url.searchParams.get("scope")).toContain("calendar.events");
    expect(provider.type).toBe(CalendarProviderType.GOOGLE);
  });

  it("exchanges a code for tokens and computes an absolute expiry", async () => {
    const http = jsonHttp({
      access_token: "ACCESS-1",
      refresh_token: "REFRESH-1",
      expires_in: 3600,
      scope: "https://www.googleapis.com/auth/calendar.events",
    });
    const provider = createGoogleCalendarProvider(config, http);
    const before = Date.now();
    const tokens = await provider.exchangeCode("auth-code");

    expect(tokens.accessToken).toBe("ACCESS-1");
    expect(tokens.refreshToken).toBe("REFRESH-1");
    expect(tokens.expiresAt).toBeInstanceOf(Date);
    expect(tokens.expiresAt!.getTime()).toBeGreaterThanOrEqual(before + 3600_000 - 1000);
    // POSTs the token endpoint with form-encoded grant.
    expect(http.calls[0]?.url).toBe("https://oauth2.googleapis.com/token");
    expect(http.calls[0]?.body).toContain("grant_type=authorization_code");
    expect(http.calls[0]?.body).toContain("code=auth-code");
  });

  it("refreshes an access token using the refresh token", async () => {
    const http = jsonHttp({ access_token: "ACCESS-2", expires_in: 3600 });
    const provider = createGoogleCalendarProvider(config, http);
    const tokens = await provider.refreshTokens!("REFRESH-1");

    expect(tokens.accessToken).toBe("ACCESS-2");
    expect(http.calls[0]?.body).toContain("grant_type=refresh_token");
    expect(http.calls[0]?.body).toContain("refresh_token=REFRESH-1");
  });

  it("resolves the stable account id from userinfo (sub)", async () => {
    const http = jsonHttp({ sub: "google-sub-999", email: "user@example.com" });
    const provider = createGoogleCalendarProvider(config, http);
    const id = await provider.getAccountId!({ accessToken: "ACCESS-1" });

    expect(id).toBe("google-sub-999");
    expect(http.calls[0]?.headers?.Authorization).toBe("Bearer ACCESS-1");
  });

  it("lists + normalizes events, skipping events without a start", async () => {
    const http = jsonHttp({
      items: [
        {
          id: "evt-1",
          status: "confirmed",
          summary: "Call",
          start: { dateTime: "2026-06-20T10:00:00Z" },
          end: { dateTime: "2026-06-20T10:30:00Z" },
          attendees: [{ email: "lead@example.com" }],
        },
        { id: "evt-no-start", summary: "broken" },
        {
          id: "evt-2",
          status: "cancelled",
          summary: "Canceled call",
          start: { dateTime: "2026-06-21T09:00:00Z" },
        },
      ],
    });
    const provider = createGoogleCalendarProvider(config, http);
    const events = await provider.listEvents!("ACCESS-1", {
      from: new Date("2026-06-01"),
      to: new Date("2026-07-01"),
    });

    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      externalEventId: "evt-1",
      title: "Call",
      attendeeEmail: "lead@example.com",
      canceled: false,
    });
    expect(events[1]).toMatchObject({ externalEventId: "evt-2", canceled: true });
  });

  it("creates an event and returns the external id; maps the payload", async () => {
    const http = jsonHttp({ id: "created-evt-1" });
    const provider = createGoogleCalendarProvider(config, http);
    const result = await provider.createEvent!("ACCESS-1", {
      title: "New meeting",
      startAt: new Date("2026-06-20T10:00:00Z"),
      endAt: new Date("2026-06-20T10:30:00Z"),
      attendeeEmail: "lead@example.com",
    });

    expect(result.externalEventId).toBe("created-evt-1");
    const body = JSON.parse(http.calls[0]?.body ?? "{}");
    expect(body.summary).toBe("New meeting");
    expect(body.attendees).toEqual([{ email: "lead@example.com" }]);
  });

  it("updates an event via PATCH on its id", async () => {
    const http = jsonHttp({ id: "evt-1" });
    const provider = createGoogleCalendarProvider(config, http);
    await provider.updateEvent!("ACCESS-1", "evt-1", {
      title: "Updated",
      startAt: new Date("2026-06-20T11:00:00Z"),
      endAt: new Date("2026-06-20T11:30:00Z"),
    });

    expect(http.calls[0]?.method).toBe("PATCH");
    expect(http.calls[0]?.url).toContain("/evt-1");
  });

  it("deletes an event; tolerates 410 already-deleted", async () => {
    const http = createFakeHttp(() => ({ status: 410, body: "" }));
    const provider = createGoogleCalendarProvider(config, http);
    await expect(provider.deleteEvent!("ACCESS-1", "evt-1")).resolves.toBeUndefined();
    expect(http.calls[0]?.method).toBe("DELETE");
  });

  it("propagates an HttpError on a failed token exchange", async () => {
    const http = createFakeHttp(() => ({ status: 400, body: '{"error":"invalid_grant"}' }));
    const provider = createGoogleCalendarProvider(config, http);
    await expect(provider.exchangeCode("bad-code")).rejects.toThrow();
  });
});
