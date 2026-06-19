"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";

import { requirePermission } from "@/lib/rbac";
import { requireTenantContext, type TenantContext } from "@/lib/tenant";
import {
  buildAppointmentDeps,
  changeAppointmentStatus,
  createAppointment,
  deleteAppointment,
  updateAppointment,
} from "@/server/appointments";
import {
  buildOutboundDeps,
  pushCreatedAppointment,
  pushDeletedAppointment,
  pushUpdatedAppointment,
} from "@/server/calendar";
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

/**
 * Best-effort outbound calendar sync (docs/08 Fase 6). Runs AFTER the core
 * appointment use case has committed, so a provider error never breaks the user
 * action (the local appointment is the source of truth). No-ops when the tenant
 * flag is off / Google is not configured / the user has no connection.
 */
async function syncOutbound(
  ctx: TenantContext,
  kind: "created" | "updated",
  appointmentId: string,
): Promise<void> {
  try {
    const deps = await buildOutboundDeps(ctx);
    if (!deps) return;
    if (kind === "created") await pushCreatedAppointment(deps, appointmentId);
    else await pushUpdatedAppointment(deps, appointmentId);
  } catch (error) {
    console.error("[calendar] outbound sync failed (non-fatal)", error);
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

    const created = await createAppointment(deps, {
      startAt: str(form, "startAt"),
      reason: str(form, "reason"),
      leadId: str(form, "leadId") || undefined,
    });

    await syncOutbound(ctx, "created", created.id);

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

    await syncOutbound(ctx, "updated", result.id);

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

    const appointmentId = str(form, "appointmentId");

    // Capture the linked external event id BEFORE deleting (tenant-scoped read),
    // so we can remove the mirrored provider event afterwards.
    const existing = await deps.prisma.appointment.findUnique({
      where: { id: appointmentId },
      select: { provider: true, externalEventId: true },
    });

    const result = await deleteAppointment(deps, { id: appointmentId });

    if (existing?.externalEventId) {
      try {
        const outbound = await buildOutboundDeps(ctx);
        if (outbound) await pushDeletedAppointment(outbound, existing.externalEventId);
      } catch (error) {
        console.error("[calendar] outbound delete sync failed (non-fatal)", error);
      }
    }

    appointmentPaths(result.leadId);
    return ok("appointments.delete.success");
  } catch (error) {
    unstable_rethrow(error);
    return toActionState(error, errorKeys);
  }
}
