import { CalendarProviderType } from "@/generated/prisma/enums";
import { getTenantPrisma } from "@/lib/prisma-tenant";
import type { TenantContext } from "@/lib/tenant";
import { isProviderConfigured } from "@/server/calendar/config";

/**
 * Read the integration status for the current user, for the settings UI.
 *
 * For each provider we expose:
 *  - `configured`: the platform has the OAuth keys + encryption key (graceful
 *    degradation: if false the UI shows a "not configured" message, no crash);
 *  - `connected`: the current user has an active `CalendarConnection`.
 *
 * IMPORTANT: this NEVER returns tokens — only booleans + the connection date.
 * The read is tenant + user scoped (the tenant client injects `organizationId`;
 * we also filter by the SERVER `userId`).
 */

export interface ProviderStatus {
  readonly provider: CalendarProviderType;
  readonly configured: boolean;
  readonly connected: boolean;
  readonly connectedAt: Date | null;
  readonly scope: string | null;
}

export const SUPPORTED_PROVIDERS = [
  CalendarProviderType.GOOGLE,
  CalendarProviderType.CALENDLY,
] as const;

export async function getIntegrationStatus(ctx: TenantContext): Promise<ProviderStatus[]> {
  const prisma = getTenantPrisma(ctx);
  const connections = await prisma.calendarConnection.findMany({
    where: { userId: ctx.userId },
    select: { provider: true, createdAt: true, scope: true },
  });
  const byProvider = new Map(connections.map((c) => [c.provider, c]));

  return SUPPORTED_PROVIDERS.map((provider) => {
    const conn = byProvider.get(provider);
    return {
      provider,
      configured: isProviderConfigured(provider),
      connected: Boolean(conn),
      connectedAt: conn?.createdAt ?? null,
      scope: conn?.scope ?? null,
    };
  });
}
