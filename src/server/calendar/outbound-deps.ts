import { CalendarProviderType } from "@/generated/prisma/enums";
import { getTenantPrisma } from "@/lib/prisma-tenant";
import { getTokenCipher } from "@/lib/crypto";
import type { TenantContext } from "@/lib/tenant";
import { getTenantFeatureFlags } from "@/server/tenant/feature-flags";
import { isProviderConfigured } from "@/server/calendar/config";
import { getProvider } from "@/server/calendar/registry";
import {
  type ConnectionPrisma,
  createConnectionStore,
} from "@/server/calendar/connection-store";
import type { OutboundDeps } from "@/server/calendar/sync/outbound";

/**
 * Build the outbound-sync deps for the appointment Server Actions, or `null` when
 * outbound sync must NOT run for this tenant/user:
 *  - the `calendarIntegrations` feature flag is OFF (e.g. Fabio), OR
 *  - Google is not configured / no encryption key.
 *
 * Returning `null` lets the action skip the push entirely — the core appointment
 * use case stays the source of truth and is never blocked by integration state.
 * (Whether the USER actually has a Google connection is checked deeper, in the
 * push, so we still build deps when configured + flag on.)
 */
export async function buildOutboundDeps(ctx: TenantContext): Promise<OutboundDeps | null> {
  const flags = await getTenantFeatureFlags(ctx.organizationId);
  if (!flags.calendarIntegrations) return null;
  if (!isProviderConfigured(CalendarProviderType.GOOGLE)) return null;

  const tenantPrisma = getTenantPrisma(ctx);
  const store = createConnectionStore(
    tenantPrisma as unknown as ConnectionPrisma,
    getTokenCipher(),
  );

  return {
    provider: getProvider(CalendarProviderType.GOOGLE),
    store,
    prisma: tenantPrisma,
    userId: ctx.userId,
  };
}
