import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { can, requirePermission } from "@/lib/rbac";
import { requireTenantContext } from "@/lib/tenant";
import { buildInsightDeps, getMonthView } from "@/server/insight";
import { getShellBranding } from "@/server/organization/get-shell-branding";
import { getTenantFeatureFlags } from "@/server/tenant/feature-flags";
import { Card, CardBody } from "@/components/ui";
import { InsightMonth } from "@/components/insight/insight-month";
import { resolveInsightMonth } from "@/components/insight/resolve-month";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function InsightPage({ searchParams }: { searchParams: SearchParams }) {
  const [t, app] = await Promise.all([getTranslations("insight"), getTranslations("app")]);
  const ctx = await requireTenantContext();
  const flags = await getTenantFeatureFlags(ctx.organizationId);
  if (!flags.insightStats) notFound();
  requirePermission(ctx.role, "insight.view");

  const month = resolveInsightMonth(await searchParams);
  const [view, branding] = await Promise.all([
    getMonthView(buildInsightDeps(ctx), month),
    getShellBranding(ctx.organizationId, app("name")),
  ]);

  const sourceLabel = branding.insightSourceLabel;
  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-3xl text-ink">
            {sourceLabel ? t("title", { source: sourceLabel }) : t("titleFallback")}
          </h1>
          <p className="font-body text-sm text-muted">{t("description")}</p>
        </div>
      </header>

      {!view || !sourceLabel ? (
        <Card>
          <CardBody className="flex flex-col gap-2 py-8 text-center">
            <h2 className="font-display text-2xl text-ink">{t("unconfigured.title")}</h2>
            <p className="text-sm text-muted">{t("unconfigured.description")}</p>
          </CardBody>
        </Card>
      ) : (
        <InsightMonth view={view} canEdit={can(ctx.role, "insight.edit")} sourceLabel={sourceLabel} />
      )}
    </div>
  );
}
