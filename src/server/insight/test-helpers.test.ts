import { describe, expect, it } from "vitest";

import { LeadStage } from "@/generated/prisma/enums";
import { InsightStore } from "@/server/insight/test-helpers";

/**
 * Copertura del FAKE stesso, non degli use case: nove task successivi
 * costruiscono i loro test di isolamento e correttezza su `InsightStore`, e un
 * bug qui verrebbe scambiato per un bug nell'use case sotto test. Copre solo
 * i comportamenti che potrebbero far passare un test successivo mentre è
 * sbagliato — non è una copertura esaustiva del fake.
 */

describe("InsightStore isolation", () => {
  it("filters reads to the bound tenant and stamps organizationId on writes even against caller intent", async () => {
    const store = new InsightStore();
    store.addLead({ organizationId: "org-a", id: "lead-a" });
    store.addLead({ organizationId: "org-b", id: "lead-b" });

    const clientA = store.tenantClient("org-a");
    const rows = await clientA.lead.findMany({ where: { id: { in: ["lead-a", "lead-b"] } } });
    expect(rows.map((r) => (r as { id: string }).id)).toEqual(["lead-a"]);

    // Il caller tenta di scrivere per un ALTRO tenant: il client vince sempre.
    await clientA.lead.create({
      data: { organizationId: "org-b", firstName: "X", lastName: "Y" },
    });
    const created = store.leads.at(-1)!;
    expect(created.organizationId).toBe("org-a");
  });
});

describe("InsightStore lead.findMany soft delete", () => {
  it("hides a soft-deleted lead from reads (mirrors injectSoftDeleteFilter)", async () => {
    const store = new InsightStore();
    store.addLead({ organizationId: "org-a", id: "lead-live" });
    store.addLead({ organizationId: "org-a", id: "lead-deleted", deletedAt: new Date("2026-09-05") });

    const rows = await store
      .tenantClient("org-a")
      .lead.findMany({ where: { id: { in: ["lead-live", "lead-deleted"] } } });

    expect(rows.map((r) => (r as { id: string }).id)).toEqual(["lead-live"]);
  });
});

describe("InsightStore appointment.groupBy", () => {
  it("returns one row per lead with the earliest createdAt, honouring the source relation filter", async () => {
    const store = new InsightStore();
    const source = store.addLeadSource({ organizationId: "org-a", label: "Instagram" });
    const otherSource = store.addLeadSource({ organizationId: "org-a", label: "Google" });
    store.addLead({ organizationId: "org-a", id: "lead-1", sourceId: source.id });
    store.addLead({ organizationId: "org-a", id: "lead-2", sourceId: otherSource.id });

    store.addAppointment({ organizationId: "org-a", leadId: "lead-1", createdAt: "2026-09-10" });
    store.addAppointment({ organizationId: "org-a", leadId: "lead-1", createdAt: "2026-09-05" });
    store.addAppointment({ organizationId: "org-a", leadId: "lead-2", createdAt: "2026-09-07" });

    const rows = (await store.tenantClient("org-a").appointment.groupBy({
      by: ["leadId"],
      where: { createdAt: { lt: new Date("2026-10-01") }, lead: { is: { sourceId: source.id } } },
      _min: { createdAt: true },
    })) as { leadId: string; _min: { createdAt: Date } }[];

    expect(rows).toEqual([{ leadId: "lead-1", _min: { createdAt: new Date("2026-09-05T00:00:00.000Z") } }]);
  });
});

describe("InsightStore stageHistory.groupBy", () => {
  it("returns the latest changedAt per lead, honouring the source + stage relation filter", async () => {
    const store = new InsightStore();
    const source = store.addLeadSource({ organizationId: "org-a", label: "Instagram" });
    store.addLead({ organizationId: "org-a", id: "lead-1", sourceId: source.id, stage: LeadStage.WON });
    store.addLead({ organizationId: "org-a", id: "lead-2", sourceId: source.id, stage: LeadStage.LOST });

    store.addStageHistory({
      organizationId: "org-a",
      leadId: "lead-1",
      toStage: LeadStage.WON,
      changedAt: "2026-09-03",
    });
    store.addStageHistory({
      organizationId: "org-a",
      leadId: "lead-1",
      toStage: LeadStage.WON,
      changedAt: "2026-09-12",
    });
    // lead-2 non è più WON: non deve comparire nel risultato.
    store.addStageHistory({
      organizationId: "org-a",
      leadId: "lead-2",
      toStage: LeadStage.WON,
      changedAt: "2026-09-08",
    });

    const rows = (await store.tenantClient("org-a").stageHistory.groupBy({
      by: ["leadId"],
      where: {
        toStage: LeadStage.WON,
        changedAt: { lt: new Date("2026-10-01") },
        lead: { is: { sourceId: source.id, stage: LeadStage.WON } },
      },
      _max: { changedAt: true },
    })) as { leadId: string; _max: { changedAt: Date } }[];

    expect(rows).toEqual([{ leadId: "lead-1", _max: { changedAt: new Date("2026-09-12T00:00:00.000Z") } }]);
  });
});

describe("InsightStore chatActivityDay.upsert", () => {
  it("updates the existing row in place on the compound key instead of duplicating it", async () => {
    const store = new InsightStore();
    const client = store.tenantClient("org-a");
    const key = { organizationId_date: { organizationId: "org-a", date: new Date("2026-09-10") } };

    await client.chatActivityDay.upsert({
      where: key,
      create: { organizationId: "org-a", date: key.organizationId_date.date, welcomeSent: 3 },
      update: { welcomeSent: 3 },
    });
    await client.chatActivityDay.upsert({
      where: key,
      create: { organizationId: "org-a", date: key.organizationId_date.date, welcomeSent: 1 },
      update: { welcomeSent: 9 },
    });

    expect(store.chatActivityDays).toHaveLength(1);
    expect(store.chatActivityDays[0]!.welcomeSent).toBe(9);
  });
});

describe("InsightStore $transaction", () => {
  it("restores every row array when the callback throws", async () => {
    const store = new InsightStore();
    store.addLead({ organizationId: "org-a", id: "lead-pre" });
    const client = store.tenantClient("org-a");

    await expect(
      client.$transaction(async (tx) => {
        await tx.lead.create({
          data: { organizationId: "org-a", firstName: "Orphan", lastName: "Lead" },
        });
        await tx.appointment.create({
          data: {
            organizationId: "org-a",
            leadId: "lead-pre",
            startAt: new Date("2026-09-10"),
            reason: "Chiamata",
          },
        });
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    expect(store.leads.map((l) => l.id)).toEqual(["lead-pre"]);
    expect(store.appointments).toHaveLength(0);
  });

  it("commits every row array when the callback succeeds", async () => {
    const store = new InsightStore();
    const client = store.tenantClient("org-a");

    await client.$transaction(async (tx) => {
      const lead = await tx.lead.create({
        data: { organizationId: "org-a", firstName: "New", lastName: "Lead" },
      });
      await tx.appointment.create({
        data: {
          organizationId: "org-a",
          leadId: (lead as { id: string }).id,
          startAt: new Date("2026-09-10"),
          reason: "Chiamata",
        },
      });
    });

    expect(store.leads).toHaveLength(1);
    expect(store.appointments).toHaveLength(1);
  });
});

describe("InsightStore failNextAppointmentCreate", () => {
  it("rejects exactly once and leaves no partial row behind", async () => {
    const store = new InsightStore();
    const client = store.tenantClient("org-a");
    store.failNextAppointmentCreate();

    const data = {
      organizationId: "org-a",
      leadId: "lead-1",
      startAt: new Date("2026-09-10"),
      reason: "Chiamata",
    };
    await expect(client.appointment.create({ data })).rejects.toThrow();
    expect(store.appointments).toHaveLength(0);

    // La seconda chiamata non fallisce più: il flag è consumato una volta sola.
    await client.appointment.create({ data });
    expect(store.appointments).toHaveLength(1);
  });
});
