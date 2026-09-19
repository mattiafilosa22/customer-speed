import { afterEach, describe, expect, it, vi } from "vitest";

import { UnauthorizedError, ValidationError } from "@/lib/errors";

const mocks = vi.hoisted(() => ({
  requireTenantContext: vi.fn(),
  getTenantFeatureFlags: vi.fn(),
  buildInsightDeps: vi.fn((..._args: unknown[]) => ({ kind: "insight" })),
  saveActivityDay: vi.fn(),
  createLeadFromCell: vi.fn(),
  listCellLeads: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/tenant", () => ({
  requireTenantContext: (...args: unknown[]) => mocks.requireTenantContext(...args),
}));
vi.mock("@/server/tenant/feature-flags", () => ({
  getTenantFeatureFlags: (...args: unknown[]) => mocks.getTenantFeatureFlags(...args),
}));
vi.mock("@/server/insight", () => ({
  buildInsightDeps: (...args: unknown[]) => mocks.buildInsightDeps(...args),
  saveActivityDay: (...args: unknown[]) => mocks.saveActivityDay(...args),
  createLeadFromCell: (...args: unknown[]) => mocks.createLeadFromCell(...args),
  listCellLeads: (...args: unknown[]) => mocks.listCellLeads(...args),
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import {
  createLeadFromCellAction,
  listCellLeadsAction,
  saveActivityDayAction,
} from "@/app/[locale]/(app)/insight/actions";

const PRO = { kind: "tenant", role: "proUser", organizationId: "org_a", userId: "u" };
const BASE = { kind: "tenant", role: "baseUser", organizationId: "org_a", userId: "u" };
const IDLE = { status: "idle" } as const;

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

function counterForm(overrides: Record<string, string> = {}) {
  return form({
    date: "2026-09-09",
    welcomeSent: "30",
    welcomeReplies: "3",
    outboundComments: "2",
    outboundStories: "1",
    outboundReplies: "2",
    inboundReceived: "1",
    ...overrides,
  });
}

function leadForm(overrides: Record<string, string> = {}) {
  return form({
    firstName: "Marco",
    lastName: "Bianchi",
    chatChannel: "OUTBOUND_COMMENT",
    appointmentAt: "2026-09-12T10:30",
    reason: "Call conoscitiva",
    ...overrides,
  });
}

afterEach(() => vi.clearAllMocks());

describe("Insight actions", () => {
  it("saves counters for an editor and revalidates the page", async () => {
    mocks.requireTenantContext.mockResolvedValue(PRO);
    mocks.getTenantFeatureFlags.mockResolvedValue({ insightStats: true });

    const state = await saveActivityDayAction(IDLE, counterForm());

    expect(state.status).toBe("success");
    expect(mocks.saveActivityDay).toHaveBeenCalledWith(
      { kind: "insight" },
      expect.objectContaining({ date: "2026-09-09", welcomeSent: "30" }),
    );
    expect(mocks.revalidatePath).toHaveBeenCalled();
  });

  it("checks auth, flag and edit capability before saving", async () => {
    mocks.requireTenantContext.mockResolvedValue(BASE);
    mocks.getTenantFeatureFlags.mockResolvedValue({ insightStats: true });
    expect((await saveActivityDayAction(IDLE, counterForm())).status).toBe("error");
    expect(mocks.saveActivityDay).not.toHaveBeenCalled();

    vi.clearAllMocks();
    mocks.requireTenantContext.mockRejectedValue(new UnauthorizedError());
    expect((await saveActivityDayAction(IDLE, counterForm())).status).toBe("error");
    expect(mocks.getTenantFeatureFlags).not.toHaveBeenCalled();
  });

  it("rejects every endpoint when the feature is off", async () => {
    mocks.requireTenantContext.mockResolvedValue(PRO);
    mocks.getTenantFeatureFlags.mockResolvedValue({ insightStats: false });

    expect((await saveActivityDayAction(IDLE, counterForm())).status).toBe("error");
    expect((await createLeadFromCellAction(IDLE, leadForm())).status).toBe("error");
    await expect(
      listCellLeadsAction({ date: "2026-09-09", group: "welcome", metric: "sales" }),
    ).rejects.toThrow();
  });

  it("keeps domain validation keys on the affected field", async () => {
    mocks.requireTenantContext.mockResolvedValue(PRO);
    mocks.getTenantFeatureFlags.mockResolvedValue({ insightStats: true });
    mocks.saveActivityDay.mockRejectedValue(
      new ValidationError({ welcomeReplies: ["insight.errors.repliesExceedWelcome"] }),
    );

    const state = await saveActivityDayAction(IDLE, counterForm());
    expect(state).toMatchObject({
      status: "error",
      fieldErrors: { welcomeReplies: "insight.errors.repliesExceedWelcome" },
    });
  });

  it("lets a base user create a lead from a cell and never trusts a tenant field", async () => {
    mocks.requireTenantContext.mockResolvedValue(BASE);
    mocks.getTenantFeatureFlags.mockResolvedValue({ insightStats: true });
    mocks.createLeadFromCell.mockResolvedValue({ leadId: "lead_1", appointmentId: "appt_1" });
    const data = leadForm({ organizationId: "org_b" });

    expect((await createLeadFromCellAction(IDLE, data)).status).toBe("success");
    expect(mocks.buildInsightDeps).toHaveBeenCalledWith(BASE);
    expect(mocks.getTenantFeatureFlags).toHaveBeenCalledWith("org_a");
  });

  it("returns the cell leads after enforcing read access", async () => {
    mocks.requireTenantContext.mockResolvedValue(BASE);
    mocks.getTenantFeatureFlags.mockResolvedValue({ insightStats: true });
    mocks.listCellLeads.mockResolvedValue([{ id: "lead_1" }]);
    const input = { date: "2026-09-09", group: "welcome", metric: "appointments" };

    await expect(listCellLeadsAction(input)).resolves.toEqual([{ id: "lead_1" }]);
    expect(mocks.listCellLeads).toHaveBeenCalledWith({ kind: "insight" }, input);
  });
});
