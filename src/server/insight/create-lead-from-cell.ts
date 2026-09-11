import { AppointmentStatus, LeadStage } from "@/generated/prisma/enums";
import { resolveCapital } from "@/lib/capital";
import { NotFoundError } from "@/lib/errors";
import { getInsightConfig } from "@/server/insight/config";
import { clockNow, type InsightDeps } from "@/server/insight/deps";
import { createLeadFromCellSchema } from "@/server/insight/schemas";
import { parseInput } from "@/server/validation";

export interface CreateLeadFromCellResult {
  readonly leadId: string;
  readonly appointmentId: string;
}

/** Create a lead and its appointment atomically from an appointments cell. */
export async function createLeadFromCell(
  deps: InsightDeps,
  input: unknown,
): Promise<CreateLeadFromCellResult> {
  const data = parseInput(createLeadFromCellSchema, input);
  const config = await getInsightConfig(deps);
  if (!config) {
    throw new NotFoundError("Insight section is not configured for this tenant");
  }

  const capital = resolveCapital({
    capitalAmount: data.capitalAmount,
    capitalBracket: data.capitalBracket,
  });
  const now = clockNow(deps);
  const created = await deps.prisma.$transaction(async (tx) => {
    const lead = await tx.lead.create({
      data: {
        organizationId: deps.actor.organizationId,
        ownerId: deps.actor.userId,
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email ?? null,
        phone: data.phone ?? null,
        sourceId: config.sourceId,
        chatChannel: data.chatChannel,
        createdFromInsight: true,
        stage: LeadStage.TO_HANDLE,
        stageChangedAt: now,
        capitalBracket: capital?.capitalBracket ?? null,
        capitalAmount: capital?.capitalAmount ?? null,
      },
      select: { id: true },
    });
    const appointment = await tx.appointment.create({
      data: {
        organizationId: deps.actor.organizationId,
        ownerId: deps.actor.userId,
        leadId: lead.id,
        startAt: data.appointmentAt,
        reason: data.reason,
        status: AppointmentStatus.PENDING,
      },
      select: { id: true },
    });
    return { leadId: lead.id, appointmentId: appointment.id };
  });

  await deps.audit.record({
    action: "insight.lead.createFromCell",
    organizationId: deps.actor.organizationId,
    actorId: deps.actor.userId,
    entity: "Lead",
    entityId: created.leadId,
    meta: { chatChannel: data.chatChannel, appointmentId: created.appointmentId },
  });
  return created;
}
