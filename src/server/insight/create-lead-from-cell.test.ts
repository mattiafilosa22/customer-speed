import { describe, expect, it } from "vitest";

import { ChatChannel, LeadStage } from "@/generated/prisma/enums";
import { createLeadFromCell } from "@/server/insight/create-lead-from-cell";
import { InsightStore } from "@/server/insight/test-helpers";

function validInput(overrides: Record<string, unknown> = {}) {
  return {
    firstName: "Marco",
    lastName: "Bianchi",
    chatChannel: ChatChannel.OUTBOUND_COMMENT,
    appointmentAt: "2026-09-12T10:30:00.000Z",
    reason: "Call conoscitiva",
    ...overrides,
  };
}

function seedConfiguredTenant() {
  const store = new InsightStore();
  const source = store.addLeadSource({ organizationId: "org-a", label: "Instagram" });
  store.addOrganization({ id: "org-a", insightSourceId: source.id });
  return { store, sourceId: source.id };
}

describe("createLeadFromCell", () => {
  it("creates a marked lead with the configured source and cell channel", async () => {
    const { store, sourceId } = seedConfiguredTenant();

    const { leadId } = await createLeadFromCell(store.deps("org-a"), validInput());

    expect(store.leads.find((lead) => lead.id === leadId)).toMatchObject({
      sourceId,
      chatChannel: ChatChannel.OUTBOUND_COMMENT,
      stage: LeadStage.TO_HANDLE,
      createdFromInsight: true,
      organizationId: "org-a",
    });
  });

  it("creates the linked appointment in the caller's tenant", async () => {
    const { store } = seedConfiguredTenant();

    const { leadId, appointmentId } = await createLeadFromCell(
      store.deps("org-a"),
      validInput(),
    );

    expect(store.appointments.find((row) => row.id === appointmentId)).toMatchObject({
      leadId,
      organizationId: "org-a",
      startAt: new Date("2026-09-12T10:30:00.000Z"),
    });
  });

  it("ignores any source supplied by the client", async () => {
    const { store, sourceId } = seedConfiguredTenant();
    const other = store.addLeadSource({ organizationId: "org-a", label: "Referenza" });

    const { leadId } = await createLeadFromCell(
      store.deps("org-a"),
      validInput({ sourceId: other.id }),
    );

    expect(store.leads.find((lead) => lead.id === leadId)?.sourceId).toBe(sourceId);
  });

  it("refuses unconfigured tenants and missing channels", async () => {
    const store = new InsightStore();
    store.addOrganization({ id: "org-a", insightSourceId: null });

    await expect(createLeadFromCell(store.deps("org-a"), validInput())).rejects.toThrow();
    await expect(
      createLeadFromCell(store.deps("org-a"), validInput({ chatChannel: undefined })),
    ).rejects.toThrow();
    expect(store.leads).toHaveLength(0);
  });

  it("rolls back the lead when appointment creation fails", async () => {
    const { store } = seedConfiguredTenant();
    store.failNextAppointmentCreate();

    await expect(createLeadFromCell(store.deps("org-a"), validInput())).rejects.toThrow(
      "simulated appointment.create failure",
    );
    expect(store.leads).toHaveLength(0);
    expect(store.appointments).toHaveLength(0);
  });

  it("records the composed operation in the audit trail", async () => {
    const { store } = seedConfiguredTenant();

    const created = await createLeadFromCell(store.deps("org-a"), validInput());

    expect(store.audits).toContainEqual(
      expect.objectContaining({
        action: "insight.lead.createFromCell",
        entityId: created.leadId,
        meta: expect.objectContaining({ appointmentId: created.appointmentId }),
      }),
    );
  });
});
