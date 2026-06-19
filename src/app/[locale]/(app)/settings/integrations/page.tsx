import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { can } from "@/lib/rbac";
import { requireTenantContext } from "@/lib/tenant";
import { getTenantFeatureFlags } from "@/server/tenant/feature-flags";
import { getIntegrationStatus } from "@/server/calendar/connection-status";
import { Card, CardBody } from "@/components/ui";
import { IntegrationCard } from "@/components/integrations/integration-card";
import { IntegrationStatusBanner } from "@/components/integrations/integration-status-banner";

/**
 * Settings → Integrazioni calendario (docs/08 Fase 6).
 *
 * Server-authoritative gating (docs/00 §4):
 *  - feature flag `calendarIntegrations` OFF (e.g. Fabio) ⇒ `notFound()` (the
 *    whole section is invisible, non-revealing);
 *  - RBAC `calendar.integrations` (proUser/superAdmin, NOT baseUser) ⇒ 404.
 *
 * Per provider it shows the connection state and a Connect/Disconnect control.
 * When a provider is enabled by flag but the PLATFORM has no credentials yet, the
 * card renders a "not configured" message instead of a broken button (graceful
 * degradation pre-infra). No token is ever sent to the client.
 */
export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = await getTranslations("integrations");
  const ctx = await requireTenantContext();

  const flags = await getTenantFeatureFlags(ctx.organizationId);
  if (!flags.calendarIntegrations) {
    notFound();
  }
  if (!can(ctx.role, "calendar.integrations")) {
    notFound();
  }

  const statuses = await getIntegrationStatus(ctx);
  const sp = await searchParams;
  const status = Array.isArray(sp.status) ? sp.status.at(-1) : sp.status;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-3xl text-ink">{t("title")}</h1>
        <p className="font-body text-[14px] text-muted">{t("description")}</p>
      </div>

      {status ? <IntegrationStatusBanner status={status} /> : null}

      <section aria-labelledby="integrations-heading" className="flex flex-col gap-4">
        <h2 id="integrations-heading" className="sr-only">
          {t("providersHeading")}
        </h2>
        {statuses.length === 0 ? (
          <Card>
            <CardBody>
              <p className="font-body text-[14px] text-muted">{t("empty")}</p>
            </CardBody>
          </Card>
        ) : (
          statuses.map((s) => <IntegrationCard key={s.provider} status={s} />)
        )}
      </section>
    </div>
  );
}
