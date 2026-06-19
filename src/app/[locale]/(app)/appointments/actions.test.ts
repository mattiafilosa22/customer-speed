import { afterEach, describe, expect, it, vi } from "vitest";

import { NotFoundError, UnauthorizedError, ValidationError } from "@/lib/errors";
import { ForbiddenError } from "@/lib/rbac";

/**
 * Appointment Server Action tests. The actions are the UI's security boundary:
 * auth (tenant context) → RBAC (`appointment.manage`, NOT baseUser) → use case →
 * `ActionState` with a STABLE i18n key. We mock the context, RBAC and the
 * appointment use cases.
 */

const requireTenantContext = vi.fn();
const requirePermission = vi.fn();
const appointmentFindUnique = vi.fn(() => Promise.resolve(null));
// Deps include a minimal `prisma` because the delete action reads the linked
// external event id before deleting (Fase 6). The use-case assertions below use
// `expect.objectContaining` so this extra field does not break them.
const FAKE_DEPS = {
  kind: "appt",
  prisma: { appointment: { findUnique: appointmentFindUnique } },
};
const buildAppointmentDeps = vi.fn((..._a: unknown[]) => FAKE_DEPS);
const createAppointment = vi.fn((...args: unknown[]): unknown => args);
const updateAppointment = vi.fn((...args: unknown[]): unknown => args);
const changeAppointmentStatus = vi.fn((...args: unknown[]): unknown => args);
const deleteAppointment = vi.fn((...args: unknown[]): unknown => args);

vi.mock("@/lib/tenant", () => ({
  requireTenantContext: (...a: unknown[]) => requireTenantContext(...a),
}));
vi.mock("@/lib/rbac", async () => {
  const actual = await vi.importActual<typeof import("@/lib/rbac")>("@/lib/rbac");
  return { ...actual, requirePermission: (...a: unknown[]) => requirePermission(...a) };
});
vi.mock("@/server/appointments", () => ({
  buildAppointmentDeps: (...a: unknown[]) => buildAppointmentDeps(...a),
  createAppointment: (...a: unknown[]) => createAppointment(...a),
  updateAppointment: (...a: unknown[]) => updateAppointment(...a),
  changeAppointmentStatus: (...a: unknown[]) => changeAppointmentStatus(...a),
  deleteAppointment: (...a: unknown[]) => deleteAppointment(...a),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
// Fase 6 outbound sync: no-op in these unit tests (flag/provider gating is tested
// in the calendar module). `buildOutboundDeps` returns null → push hooks skip.
vi.mock("@/server/calendar", () => ({
  buildOutboundDeps: vi.fn(() => Promise.resolve(null)),
  pushCreatedAppointment: vi.fn(),
  pushUpdatedAppointment: vi.fn(),
  pushDeletedAppointment: vi.fn(),
}));

import {
  changeAppointmentStatusAction,
  createAppointmentAction,
  deleteAppointmentAction,
  updateAppointmentAction,
} from "@/app/[locale]/(app)/appointments/actions";

const PRO = { kind: "tenant", role: "proUser", organizationId: "org_a", userId: "u" };
const BASE = { kind: "tenant", role: "baseUser", organizationId: "org_a", userId: "u" };
const IDLE = { status: "idle" } as const;

function form(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.set(k, v);
  return fd;
}

const validCreate = () => form({ startAt: "2026-06-20T10:30", reason: "Call" });

afterEach(() => vi.clearAllMocks());

describe("createAppointmentAction", () => {
  it("checks appointment.manage and calls the use case (happy path, proUser)", async () => {
    requireTenantContext.mockResolvedValue(PRO);
    requirePermission.mockReturnValue(undefined);
    createAppointment.mockResolvedValue({ id: "appt_1" });

    const res = await createAppointmentAction(IDLE, validCreate());

    expect(requirePermission).toHaveBeenCalledWith("proUser", "appointment.manage");
    expect(createAppointment).toHaveBeenCalledWith(
      FAKE_DEPS,
      expect.objectContaining({ startAt: "2026-06-20T10:30", reason: "Call" }),
    );
    expect(res).toEqual({ status: "success", messageKey: "appointments.create.success" });
  });

  it("denies baseUser (ForbiddenError → unauthorized key; use case never called)", async () => {
    requireTenantContext.mockResolvedValue(BASE);
    requirePermission.mockImplementation(() => {
      throw new ForbiddenError("appointment.manage");
    });

    const res = await createAppointmentAction(IDLE, validCreate());

    expect(res).toEqual({ status: "error", formError: "appointments.errors.unauthorized" });
    expect(createAppointment).not.toHaveBeenCalled();
  });

  it("maps missing auth to the unauthorized key", async () => {
    requireTenantContext.mockRejectedValue(new UnauthorizedError());

    const res = await createAppointmentAction(IDLE, validCreate());

    expect(res).toEqual({ status: "error", formError: "appointments.errors.unauthorized" });
  });

  it("maps a ValidationError to per-field keys", async () => {
    requireTenantContext.mockResolvedValue(PRO);
    requirePermission.mockReturnValue(undefined);
    createAppointment.mockRejectedValue(new ValidationError({ reason: ["bad"] }));

    const res = await createAppointmentAction(IDLE, validCreate());

    expect(res).toEqual({
      status: "error",
      fieldErrors: { reason: "appointments.errors.fields.reason" },
    });
  });

  it("maps a NotFoundError (cross-tenant lead) to the notFound key", async () => {
    requireTenantContext.mockResolvedValue(PRO);
    requirePermission.mockReturnValue(undefined);
    createAppointment.mockRejectedValue(new NotFoundError());

    const res = await createAppointmentAction(IDLE, validCreate());

    expect(res).toEqual({ status: "error", formError: "appointments.errors.notFound" });
  });
});

describe("changeAppointmentStatusAction", () => {
  it("checks appointment.manage and changes the status (happy path)", async () => {
    requireTenantContext.mockResolvedValue(PRO);
    requirePermission.mockReturnValue(undefined);
    changeAppointmentStatus.mockResolvedValue({ id: "appt_1", leadId: null });

    const res = await changeAppointmentStatusAction(
      IDLE,
      form({ appointmentId: "appt_1", status: "DONE" }),
    );

    expect(requirePermission).toHaveBeenCalledWith("proUser", "appointment.manage");
    expect(changeAppointmentStatus).toHaveBeenCalledWith(
      FAKE_DEPS,
      "appt_1",
      { status: "DONE" },
    );
    expect(res).toEqual({ status: "success", messageKey: "appointments.status.success" });
  });

  it("denies baseUser (use case never called)", async () => {
    requireTenantContext.mockResolvedValue(BASE);
    requirePermission.mockImplementation(() => {
      throw new ForbiddenError("appointment.manage");
    });

    const res = await changeAppointmentStatusAction(
      IDLE,
      form({ appointmentId: "appt_1", status: "DONE" }),
    );

    expect(res).toEqual({ status: "error", formError: "appointments.errors.unauthorized" });
    expect(changeAppointmentStatus).not.toHaveBeenCalled();
  });
});

describe("updateAppointmentAction", () => {
  it("checks appointment.manage and updates (happy path)", async () => {
    requireTenantContext.mockResolvedValue(PRO);
    requirePermission.mockReturnValue(undefined);
    updateAppointment.mockResolvedValue({
      id: "appt_1",
      previousLeadId: null,
      nextLeadId: "lead_1",
    });

    const res = await updateAppointmentAction(
      IDLE,
      form({ appointmentId: "appt_1", startAt: "2026-07-01T09:00", reason: "x", leadId: "lead_1" }),
    );

    expect(updateAppointment).toHaveBeenCalledWith(
      FAKE_DEPS,
      "appt_1",
      expect.objectContaining({ reason: "x", leadId: "lead_1" }),
    );
    expect(res).toEqual({ status: "success", messageKey: "appointments.update.success" });
  });
});

describe("deleteAppointmentAction", () => {
  it("checks appointment.manage and deletes (happy path)", async () => {
    requireTenantContext.mockResolvedValue(PRO);
    requirePermission.mockReturnValue(undefined);
    deleteAppointment.mockResolvedValue({ id: "appt_1", leadId: null });

    const res = await deleteAppointmentAction(IDLE, form({ appointmentId: "appt_1" }));

    expect(requirePermission).toHaveBeenCalledWith("proUser", "appointment.manage");
    expect(res).toEqual({ status: "success", messageKey: "appointments.delete.success" });
  });

  it("denies baseUser (use case never called)", async () => {
    requireTenantContext.mockResolvedValue(BASE);
    requirePermission.mockImplementation(() => {
      throw new ForbiddenError("appointment.manage");
    });

    const res = await deleteAppointmentAction(IDLE, form({ appointmentId: "appt_1" }));

    expect(res).toEqual({ status: "error", formError: "appointments.errors.unauthorized" });
    expect(deleteAppointment).not.toHaveBeenCalled();
  });
});
