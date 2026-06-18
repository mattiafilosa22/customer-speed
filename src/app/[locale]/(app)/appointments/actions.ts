"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";

import { requirePermission } from "@/lib/rbac";
import { requireTenantContext } from "@/lib/tenant";
import {
  buildAppointmentDeps,
  changeAppointmentStatus,
  createAppointment,
  deleteAppointment,
  updateAppointment,
} from "@/server/appointments";
import {
  type ActionState,
  type ErrorKeyMap,
  ok,
  toActionState,
} from "@/server/actions/action-result";

/**
 * Appointment Server Actions (docs/04 §4.5) — the ONLY boundary the appointment
 * forms talk to (docs/00 §1, §4: UI → Server Action → use case; never UI →
 * Prisma).
 *
 * Every action follows the mandatory order: auth (tenant context) → RBAC
 * (`appointment.manage` — granted to proUser/superAdmin, NOT baseUser, docs/02
 * §2.1) → build tenant-scoped deps → tested use case → revalidate → map typed
 * errors to STABLE i18n keys. The actor (org + user) comes from the SERVER
 * context, never the client.
 */

const errorKeys: ErrorKeyMap = {
  unauthorized: "appointments.errors.unauthorized",
  conflict: "appointments.errors.generic",
  notFound: "appointments.errors.notFound",
  rateLimited: "appointments.errors.generic",
  generic: "appointments.errors.generic",
  fieldErrorKey: (field) => `appointments.errors.fields.${field || "form"}`,
};

function str(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

/** Revalidate the appointment surfaces + an optional linked lead detail page. */
function appointmentPaths(...leadIds: ReadonlyArray<string | null | undefined>): void {
  revalidatePath("/[locale]/(app)/appointments", "page");
  for (const leadId of leadIds) {
    if (leadId) {
      revalidatePath(`/[locale]/(app)/leads/${leadId}`, "page");
    }
  }
}

export async function createAppointmentAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const ctx = await requireTenantContext();
    requirePermission(ctx.role, "appointment.manage");
    const deps = buildAppointmentDeps(ctx);

    await createAppointment(deps, {
      startAt: str(form, "startAt"),
      reason: str(form, "reason"),
      leadId: str(form, "leadId") || undefined,
    });

    appointmentPaths(str(form, "leadId") || undefined);
    return ok("appointments.create.success");
  } catch (error) {
    unstable_rethrow(error);
    return toActionState(error, errorKeys);
  }
}

export async function updateAppointmentAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const ctx = await requireTenantContext();
    requirePermission(ctx.role, "appointment.manage");
    const deps = buildAppointmentDeps(ctx);

    // `leadId` is always present in the edit form (empty string clears the link),
    // so it maps to an explicit value (the use case treats null as "clear").
    const result = await updateAppointment(deps, str(form, "appointmentId"), {
      startAt: str(form, "startAt"),
      reason: str(form, "reason"),
      leadId: str(form, "leadId") || null,
    });

    appointmentPaths(result.previousLeadId, result.nextLeadId);
    return ok("appointments.update.success");
  } catch (error) {
    unstable_rethrow(error);
    return toActionState(error, errorKeys);
  }
}

export async function changeAppointmentStatusAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const ctx = await requireTenantContext();
    requirePermission(ctx.role, "appointment.manage");
    const deps = buildAppointmentDeps(ctx);

    const result = await changeAppointmentStatus(deps, str(form, "appointmentId"), {
      status: str(form, "status"),
    });

    appointmentPaths(result.leadId);
    return ok("appointments.status.success");
  } catch (error) {
    unstable_rethrow(error);
    return toActionState(error, errorKeys);
  }
}

export async function deleteAppointmentAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const ctx = await requireTenantContext();
    requirePermission(ctx.role, "appointment.manage");
    const deps = buildAppointmentDeps(ctx);

    const result = await deleteAppointment(deps, { id: str(form, "appointmentId") });

    appointmentPaths(result.leadId);
    return ok("appointments.delete.success");
  } catch (error) {
    unstable_rethrow(error);
    return toActionState(error, errorKeys);
  }
}
