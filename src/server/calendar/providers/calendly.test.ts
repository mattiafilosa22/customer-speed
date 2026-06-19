import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { CalendarProviderType } from "@/generated/prisma/enums";
import { WebhookVerificationError } from "@/server/calendar/provider";
import {
  createCalendlyProvider,
  type CalendlyProviderConfig,
} from "@/server/calendar/providers/calendly";
import { jsonHttp } from "@/server/calendar/test-http";

const SIGNING_KEY = "whsec_test_signing_key";

const config: CalendlyProviderConfig = {
  clientId: "cal-client",
  clientSecret: "cal-secret",
  redirectUri: "https://app.example.com/api/integrations/calendly/callback",
  webhookSigningKey: SIGNING_KEY,
};

function sign(rawBody: string, timestamp = "1700000000"): string {
  const v1 = createHmac("sha256", SIGNING_KEY).update(`${timestamp}.${rawBody}`).digest("hex");
  return `t=${timestamp},v1=${v1}`;
}

const invitedCreated = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
    event: "invitee.created",
    created_by: "https://api.calendly.com/users/USER-1",
    payload: {
      email: "lead@example.com",
      name: "Lead Person",
      uri: "https://api.calendly.com/scheduled_events/EVT-1/invitees/INV-1",
      scheduled_event: {
        uri: "https://api.calendly.com/scheduled_events/EVT-1",
        name: "Discovery call",
        start_time: "2026-06-20T10:00:00Z",
        end_time: "2026-06-20T10:30:00Z",
      },
    },
    ...overrides,
  });

describe("CalendlyProvider — OAuth", () => {
  it("exchanges a code and persists the owner as accountId", async () => {
    const http = jsonHttp({
      access_token: "ACCESS-1",
      refresh_token: "REFRESH-1",
      expires_in: 7200,
      owner: "https://api.calendly.com/users/USER-1",
    });
    const provider = createCalendlyProvider(config, http);
    const tokens = await provider.exchangeCode("auth-code");

    expect(tokens.accessToken).toBe("ACCESS-1");
    expect(tokens.accountId).toBe("https://api.calendly.com/users/USER-1");
    expect(await provider.getAccountId!(tokens)).toBe(tokens.accountId);
  });

  it("builds an auth URL with state", () => {
    const provider = createCalendlyProvider(config, jsonHttp({}));
    const url = new URL(provider.getAuthUrl({ state: "csrf-1" }));
    expect(url.searchParams.get("state")).toBe("csrf-1");
    expect(provider.type).toBe(CalendarProviderType.CALENDLY);
  });
});

describe("CalendlyProvider — webhook signature", () => {
  it("parses an event when the signature is VALID", () => {
    const provider = createCalendlyProvider(config, jsonHttp({}));
    const rawBody = invitedCreated();
    const parsed = provider.parseWebhook!({
      rawBody,
      headers: { "calendly-webhook-signature": sign(rawBody) },
    });

    expect(parsed.providerAccountId).toBe("https://api.calendly.com/users/USER-1");
    expect(parsed.events).toHaveLength(1);
    expect(parsed.events[0]).toMatchObject({
      externalEventId: "https://api.calendly.com/scheduled_events/EVT-1",
      attendeeEmail: "lead@example.com",
      canceled: false,
    });
  });

  it("THROWS WebhookVerificationError on a missing signature (→ 401)", () => {
    const provider = createCalendlyProvider(config, jsonHttp({}));
    expect(() =>
      provider.parseWebhook!({ rawBody: invitedCreated(), headers: {} }),
    ).toThrow(WebhookVerificationError);
  });

  it("THROWS on a tampered body (signature mismatch)", () => {
    const provider = createCalendlyProvider(config, jsonHttp({}));
    const rawBody = invitedCreated();
    const signature = sign(rawBody);
    // Body changed after signing → HMAC no longer matches.
    const tamperedBody = rawBody.replace("lead@example.com", "attacker@evil.com");
    expect(() =>
      provider.parseWebhook!({
        rawBody: tamperedBody,
        headers: { "calendly-webhook-signature": signature },
      }),
    ).toThrow(WebhookVerificationError);
  });

  it("THROWS on a signature computed with a different key", () => {
    const provider = createCalendlyProvider(config, jsonHttp({}));
    const rawBody = invitedCreated();
    const wrong = createHmac("sha256", "another-key").update(`1700000000.${rawBody}`).digest("hex");
    expect(() =>
      provider.parseWebhook!({
        rawBody,
        headers: { "calendly-webhook-signature": `t=1700000000,v1=${wrong}` },
      }),
    ).toThrow(WebhookVerificationError);
  });

  it("marks invitee.canceled events as canceled", () => {
    const provider = createCalendlyProvider(config, jsonHttp({}));
    const rawBody = invitedCreated({ event: "invitee.canceled" });
    const parsed = provider.parseWebhook!({
      rawBody,
      headers: { "calendly-webhook-signature": sign(rawBody) },
    });
    expect(parsed.events[0]?.canceled).toBe(true);
  });

  it("returns no events for an authenticated-but-unknown shape (no throw)", () => {
    const provider = createCalendlyProvider(config, jsonHttp({}));
    const rawBody = JSON.stringify({ hello: "world" });
    const parsed = provider.parseWebhook!({
      rawBody,
      headers: { "calendly-webhook-signature": sign(rawBody) },
    });
    expect(parsed.events).toHaveLength(0);
  });
});
