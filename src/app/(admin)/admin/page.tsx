import { getTranslations } from "next-intl/server";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { requireSuperAdminContext } from "@/lib/tenant";
import { createAuditLogger } from "@/server/audit/audit-log";
import { buildAdminDeps, getGlobalMetrics } from "@/server/admin";
import { formatCurrencyWhole, formatPercent } from "@/i18n/format";
import { MetricCard } from "@/components/admin/metric-card";

/**
 * Admin landing — GLOBAL, cross-tenant metrics (docs/08 Fase 7 "metriche
 * globali"). superAdmin only.
 *
 * The layout already gates the area; we re-resolve the superAdmin context and
 * re-check `admin.tenants` here (defense in depth, docs/06 §6.3) and read the
 * metrics via the audited cross-tenant use case.
 */
export default async function AdminHomePage() {
  const t = await getTranslations("admin.dashboard");

  const ctx = await requireSuperAdminContext();
  requirePermission(ctx.role, "admin.tenants");

  const deps = buildAdminDeps(ctx);
  const metrics = await getGlobalMetrics(deps);

  // Cross-tenant reads must be traceable too (docs/06 §6.4): record the global
  // metrics access. `organizationId` is null because this read spans all tenants.
  await createAuditLogger(prisma).record({
    action: "admin.metrics.view",
    actorId: ctx.userId,
    organizationId: null,
  });

  const [convRate, netRevenue] = await Promise.all([
    formatPercent(metrics.convRate),
    formatCurrencyWhole(metrics.netRevenue),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-3xl text-ink">{t("title")}</h1>
        <p className="font-body text-[14px] text-muted">{t("subtitle")}</p>
      </div>

      <section
        aria-label={t("title")}
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        <MetricCard label={t("tenants")} value={String(metrics.tenantCount)} />
        <MetricCard label={t("users")} value={String(metrics.userCount)} />
        <MetricCard label={t("leads")} value={String(metrics.leadCount)} />
        <MetricCard label={t("won")} value={String(metrics.wonCount)} />
        <MetricCard label={t("convRate")} value={convRate} />
        <MetricCard label={t("netRevenue")} value={netRevenue} />
      </section>
    </div>
  );
}
