import { describe, expect, it } from "vitest";

import { AppointmentStatus, CalendarProviderType } from "@/generated/prisma/enums";
import type { CalendarEvent } from "@/server/calendar/provider";
import { importEvents } from "@/server/calendar/sync/import-events";
import { FakeTenantDb, fakeAudit } from "@/server/calendar/test-helpers";

const ORG_A = "org_a";
const ORG_B = "org_b";

const event = (overrides: Partial<CalendarEvent> = {}): CalendarEvent => ({
  externalEventId: "ext-1",
  title: "Imported call",
  startAt: new Date("2026-06-20T10:00:00Z"),
  endAt: new Date("2026-06-20T10:30:00Z"),
  attendeeEmail: null,
  canceled: false,
  ...overrides,
});

describe("importEvents", () => {
  it("creates an appointment for a new external event", async () => {
    const db = new FakeTenantDb();
    const { audit, events } = fakeAudit();

    const result = await importEvents({
      prisma: db.tenant(ORG_A),
      audit,
      organizationId: ORG_A,
      provider: CalendarProviderType.CALENDLY,
      events: [event()],
    });

    expect(result.created).toBe(1);
    expect(db.appointments).toHaveLength(1);
    expect(db.appointments[0]).toMatchObject({
      organizationId: ORG_A,
      provider: CalendarProviderType.CALENDLY,
      externalEventId: "ext-1",
      status: AppointmentStatus.PENDING,
    });
    expect(events.at(-1)?.action).toBe("calendar.import");
  });

  it("is IDEMPOTENT on replay (same external id updates, never duplicates)", async () => {
    const db = new FakeTenantDb();
    const { audit } = fakeAudit();
    const deps = {
      prisma: db.tenant(ORG_A),
      audit,
      organizationId: ORG_A,
      provider: CalendarProviderType.CALENDLY,
    };

    await importEvents({ ...deps, events: [event({ title: "v1" })] });
    const second = await importEvents({ ...deps, events: [event({ title: "v2" })] });

    expect(db.appointments).toHaveLength(1); // no duplicate
    expect(second.created).toBe(0);
    expect(second.updated).toBe(1);
    expect(db.appointments[0]?.reason).toBe("v2");
  });

  it("matches a lead by email within the SAME tenant", async () => {
    const db = new FakeTenantDb();
    const lead = db.addLead({ organizationId: ORG_A, email: "Lead@Example.com" });
    const { audit } = fakeAudit();

    await importEvents({
      prisma: db.tenant(ORG_A),
      audit,
      organizationId: ORG_A,
      provider: CalendarProviderType.CALENDLY,
      events: [event({ attendeeEmail: "lead@example.com" })], // case-insensitive
    });

    expect(db.appointments[0]?.leadId).toBe(lead.id);
  });

  it("does NOT match a same-email lead from another tenant (isolation)", async () => {
    const db = new FakeTenantDb();
    db.addLead({ organizationId: ORG_B, email: "lead@example.com" });
    const { audit } = fakeAudit();

    await importEvents({
      prisma: db.tenant(ORG_A),
      audit,
      organizationId: ORG_A,
      provider: CalendarProviderType.CALENDLY,
      events: [event({ attendeeEmail: "lead@example.com" })],
    });

    // Imported into ORG_A with NO lead link (the ORG_B lead is invisible).
    expect(db.appointments).toHaveLength(1);
    expect(db.appointments[0]?.organizationId).toBe(ORG_A);
    expect(db.appointments[0]?.leadId).toBeNull();
  });

  it("flips status to CANCELED for a canceled upstream event", async () => {
    const db = new FakeTenantDb();
    const { audit } = fakeAudit();
    const deps = {
      prisma: db.tenant(ORG_A),
      audit,
      organizationId: ORG_A,
      provider: CalendarProviderType.GOOGLE,
    };

    await importEvents({ ...deps, events: [event()] });
    const result = await importEvents({ ...deps, events: [event({ canceled: true })] });

    expect(result.canceled).toBe(1);
    expect(db.appointments).toHaveLength(1);
    expect(db.appointments[0]?.status).toBe(AppointmentStatus.CANCELED);
  });
});
