import type { ChatChannel } from "@/generated/prisma/enums";
import { ValidationError } from "@/lib/errors";
import type { LeadDeps } from "@/server/leads/deps";

/** Require attribution only when the selected source powers Insight & Stats. */
export async function requireChannelForLinkedSource(
  deps: LeadDeps,
  sourceId: string | null | undefined,
  chatChannel: ChatChannel | null | undefined,
): Promise<void> {
  if (!sourceId || chatChannel) {
    return;
  }

  const organization = await deps.prisma.organization.findUnique({
    where: { id: deps.actor.organizationId },
    select: { insightSourceId: true },
  });
  if (organization?.insightSourceId === sourceId) {
    throw new ValidationError({ chatChannel: ["leads.errors.chatChannelRequired"] });
  }
}
