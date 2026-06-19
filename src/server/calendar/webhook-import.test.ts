import { describe, expect, it } from "vitest";

import { CalendarProviderType } from "@/generated/prisma/enums";
import { createTokenCipher } from "@/lib/crypto";
import { createConnectionStore } from "@/server/calendar/connection-store";
import type { CalendarEvent, CalendarProvider, ParsedWebhook } from "@/server/calendar/provider";
import { handleVerifiedWebhook } from "@/server/calendar/webhook-import";
import { FakeTenantDb, fakeAudit } from "@/server/calendar/test-helpers";

const KEY = Buffer.alloc(32, 3).toString("base64");
const ORG_A = "org_a";
const ORG_B = "org_b";

/** A provider stub — `parseWebhook` is not used here (we pass parsed input). */
const providerStub = {} as CalendarProvider;

const calEvent = (overrides: Partial<CalendarEvent> = {}): CalendarEvent => ({
  externalEventId: "ext-1",
  title: "Calendly call",
  startAt: new Date("2026-06-20T10:00:00Z"),
  endAt: null,
  attendeeEmail: null,
  canceled: false,
  ...overrides,
});

function setup() {
  const db = new FakeTenantDb();
  const cipher = createTokenCipher(KEY);
  const store = createConnectionStore(db.baseConnectionPrisma(), cipher);
  const { audit, events } = fakeAudit();
  const deps = {
    provider: providerStub,
    store,
    audit,
    // Inject the fake tenant factory so no DB is touched.
    tenantPrismaFactory: ({ organizationId }: { organizationId: string }) =>
      db.tenant(organizationId),
    // Flag enabled by default; individual tests can override.
    flagLoader: () => Promise.resolve(true),
  };
  return { db, cipher, deps, events };
}

describe("handleVerifiedWebhook (secure tenant mapping)", () => {
  it("imports into the OWNING connection's tenant (mapped via providerAccountId)", async () => {
    const { db, cipher, deps } = setup();
    db.addConnection({
      organizationId: ORG_A,
      userId: "user_a",
      provider: CalendarProviderType.CALENDLY,
      accessToken: cipher.encrypt("A"),
      refreshToken: null,
      expiresAt: null,
      scope: null,
      providerAccountId: "calendly-user-A",
    });

    const parsed: ParsedWebhook = {
      providerAccountId: "calendly-user-A",
      events: [calEvent()],
    };
    const outcome = await handleVerifiedWebhook(deps, parsed, CalendarProviderType.CALENDLY);

    expect(outcome.matched).toBe(true);
    expect(db.appointments).toHaveLength(1);
    expect(db.appointments[0]?.organizationId).toBe(ORG_A);
  });

  it("IGNORES an event whose provider account is unknown (no tenant to attribute)", async () => {
    const { db, deps } = setup();
    const parsed: ParsedWebhook = {
      providerAccountId: "stranger-account",
      events: [calEvent()],
    };
    const outcome = await handleVerifiedWebhook(deps, parsed, CalendarProviderType.CALENDLY);

    expect(outcome.matched).toBe(false);
    expect(outcome.result).toBeNull();
    expect(db.appointments).toHaveLength(0);
  });

  it("never lets the payload pick the tenant: account id maps to ITS OWN org only", async () => {
    const { db, cipher, deps } = setup();
    // Connection belongs to ORG_B. A lead with the invitee email exists in ORG_A.
    db.addConnection({
      organizationId: ORG_B,
      userId: "user_b",
      provider: CalendarProviderType.CALENDLY,
      accessToken: cipher.encrypt("B"),
      refreshToken: null,
      expiresAt: null,
      scope: null,
      providerAccountId: "calendly-user-B",
    });
    db.addLead({ organizationId: ORG_A, email: "victim@example.com" });

    const parsed: ParsedWebhook = {
      providerAccountId: "calendly-user-B",
      events: [calEvent({ attendeeEmail: "victim@example.com" })],
    };
    await handleVerifiedWebhook(deps, parsed, CalendarProviderType.CALENDLY);

    // Imported into ORG_B (the connection's org), NOT ORG_A; and NOT linked to
    // the ORG_A lead (cross-tenant invisible).
    expect(db.appointments).toHaveLength(1);
    expect(db.appointments[0]?.organizationId).toBe(ORG_B);
    expect(db.appointments[0]?.leadId).toBeNull();
  });

  it("is idempotent across replays of the same event", async () => {
    const { db, cipher, deps } = setup();
    db.addConnection({
      organizationId: ORG_A,
      userId: "user_a",
      provider: CalendarProviderType.CALENDLY,
      accessToken: cipher.encrypt("A"),
      refreshToken: null,
      expiresAt: null,
      scope: null,
      providerAccountId: "calendly-user-A",
    });
    const parsed: ParsedWebhook = {
      providerAccountId: "calendly-user-A",
      events: [calEvent()],
    };

    await handleVerifiedWebhook(deps, parsed, CalendarProviderType.CALENDLY);
    await handleVerifiedWebhook(deps, parsed, CalendarProviderType.CALENDLY);

    expect(db.appointments).toHaveLength(1); // replay updated, did not duplicate
  });

  it("does NOT import when the tenant feature flag is OFF (stale subscription)", async () => {
    const { db, cipher, deps } = setup();
    db.addConnection({
      organizationId: ORG_A,
      userId: "user_a",
      provider: CalendarProviderType.CALENDLY,
      accessToken: cipher.encrypt("A"),
      refreshToken: null,
      expiresAt: null,
      scope: null,
      providerAccountId: "calendly-user-A",
    });
    const parsed: ParsedWebhook = {
      providerAccountId: "calendly-user-A",
      events: [calEvent()],
    };

    const outcome = await handleVerifiedWebhook(
      { ...deps, flagLoader: () => Promise.resolve(false) },
      parsed,
      CalendarProviderType.CALENDLY,
    );

    expect(outcome.matched).toBe(false);
    expect(db.appointments).toHaveLength(0);
  });

  it("refuses to attribute when the SAME provider account is connected by two tenants (ambiguous)", async () => {
    const { db, cipher, deps } = setup();
    for (const [org, user] of [
      [ORG_A, "user_a"],
      [ORG_B, "user_b"],
    ] as const) {
      db.addConnection({
        organizationId: org,
        userId: user,
        provider: CalendarProviderType.CALENDLY,
        accessToken: cipher.encrypt("x"),
        refreshToken: null,
        expiresAt: null,
        scope: null,
        providerAccountId: "shared-account",
      });
    }
    const parsed: ParsedWebhook = {
      providerAccountId: "shared-account",
      events: [calEvent()],
    };

    const outcome = await handleVerifiedWebhook(deps, parsed, CalendarProviderType.CALENDLY);

    expect(outcome.matched).toBe(false);
    expect(db.appointments).toHaveLength(0); // not attributed to either tenant
  });

  it("no-ops for an empty event list (ignored event type)", async () => {
    const { deps } = setup();
    const parsed: ParsedWebhook = { providerAccountId: "x", events: [] };
    const outcome = await handleVerifiedWebhook(deps, parsed, CalendarProviderType.CALENDLY);
    expect(outcome.matched).toBe(false);
    expect(outcome.result).toEqual({ created: 0, updated: 0, canceled: 0 });
  });
});
