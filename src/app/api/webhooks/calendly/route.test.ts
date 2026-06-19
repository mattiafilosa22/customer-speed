import { createHmac } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { CalendarProviderType } from "@/generated/prisma/enums";
import { createCalendlyProvider } from "@/server/calendar/providers/calendly";
import { jsonHttp } from "@/server/calendar/test-http";

/**
 * Route-handler tests for POST /api/webhooks/calendly. We mock the provider
 * factory (returning a REAL Calendly provider so the HMAC signature check is
 * genuinely exercised) and the import handler/deps. Covers: valid signature →
 * 200, invalid/missing signature → 401, and unattributed event → 200 no-op.
 */

const SIGNING_KEY = "whsec_test_route_key";

const handleVerifiedWebhook = vi.fn();
const buildWebhookConnectionStore = vi.fn((..._a: unknown[]) => ({}));
const buildAudit = vi.fn((..._a: unknown[]) => ({ record: vi.fn() }));

vi.mock("@/server/calendar/registry", () => ({
  getProvider: () =>
    createCalendlyProvider(
      {
        clientId: "c",
        clientSecret: "s",
        redirectUri: "https://app/cb",
        webhookSigningKey: SIGNING_KEY,
      },
      jsonHttp({}),
    ),
}));
vi.mock("@/server/calendar/context-deps", () => ({
  buildWebhookConnectionStore: (...a: unknown[]) => buildWebhookConnectionStore(...a),
  buildAudit: (...a: unknown[]) => buildAudit(...a),
}));
vi.mock("@/server/calendar/webhook-import", () => ({
  handleVerifiedWebhook: (...a: unknown[]) => handleVerifiedWebhook(...a),
}));

import { POST } from "@/app/api/webhooks/calendly/route";

const body = JSON.stringify({
  event: "invitee.created",
  created_by: "https://api.calendly.com/users/USER-1",
  payload: {
    email: "lead@example.com",
    uri: "https://api.calendly.com/scheduled_events/E/invitees/I",
    scheduled_event: {
      uri: "https://api.calendly.com/scheduled_events/E",
      name: "Call",
      start_time: "2026-06-20T10:00:00Z",
    },
  },
});

function sign(raw: string, ts = "1700000000"): string {
  const v1 = createHmac("sha256", SIGNING_KEY).update(`${ts}.${raw}`).digest("hex");
  return `t=${ts},v1=${v1}`;
}

function request(raw: string, signature?: string): NextRequest {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (signature) headers["calendly-webhook-signature"] = signature;
  return new NextRequest("http://localhost/api/webhooks/calendly", {
    method: "POST",
    headers,
    body: raw,
  });
}

afterEach(() => vi.clearAllMocks());

describe("POST /api/webhooks/calendly", () => {
  it("verifies a VALID signature and imports (200)", async () => {
    handleVerifiedWebhook.mockResolvedValue({ matched: true, result: { created: 1 } });

    const res = await POST(request(body, sign(body)));

    expect(res.status).toBe(200);
    expect(handleVerifiedWebhook).toHaveBeenCalledTimes(1);
    const [, parsed, providerType] = handleVerifiedWebhook.mock.calls[0]!;
    expect(providerType).toBe(CalendarProviderType.CALENDLY);
    expect(parsed.providerAccountId).toBe("https://api.calendly.com/users/USER-1");
  });

  it("rejects a MISSING signature with 401 (no import)", async () => {
    const res = await POST(request(body));
    expect(res.status).toBe(401);
    expect(handleVerifiedWebhook).not.toHaveBeenCalled();
  });

  it("rejects an INVALID signature with 401", async () => {
    const res = await POST(request(body, "t=1700000000,v1=deadbeef"));
    expect(res.status).toBe(401);
    expect(handleVerifiedWebhook).not.toHaveBeenCalled();
  });

  it("rejects a body tampered after signing with 401", async () => {
    const signature = sign(body);
    const tampered = body.replace("lead@example.com", "attacker@evil.com");
    const res = await POST(request(tampered, signature));
    expect(res.status).toBe(401);
  });

  it("returns 200 with a constant body for a verified-but-unattributed event (no oracle / no retry storm)", async () => {
    handleVerifiedWebhook.mockResolvedValue({ matched: false, result: null });
    const res = await POST(request(body, sign(body)));
    expect(res.status).toBe(200);
    const json = await res.json();
    // Constant body — does not reveal whether the account is connected here.
    expect(json).toEqual({ ok: true });
  });
});
