import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { requireTenantContext } from "@/lib/tenant";
import { can } from "@/lib/rbac";
import { getSessionUser } from "@/server/auth/guards";
import {
  buildDashboardDeps,
  getActiveLeads,
  getDashboardKpis,
  getInvoiceSummary,
  getLostBreakdown,
  getPipelineDistribution,
  getSourceBreakdown,
  resolveDateRangeBounds,
} from "@/server/dashboard";
import { buildLeadDeps, listLeadSources } from "@/server/leads";
import { PeriodFilter } from "@/components/pipeline/period-filter";
import { Card, CardBody } from "@/components/ui";
import { KpiCards } from "@/components/dashboard/kpi-cards";
import { PipelineDistribution } from "@/components/dashboard/pipeline-distribution";
import { InvoiceSummary } from "@/components/dashboard/invoice-summary";
import { LostBreakdown } from "@/components/dashboard/lost-breakdown";
import { SourceBreakdown } from "@/components/dashboard/source-breakdown";
import { ActiveLeads } from "@/components/dashboard/active-leads";
import { DateRangeFilter } from "@/components/dashboard/date-range-filter";
import { SourceFilter } from "@/components/dashboard/source-filter";

/**
 * Dashboard (docs/02 §2.2). Server Component: resolves the tenant context,
 * enforces `dashboard.view` (server-authoritative; 404 avoids revealing the
 * area), reads the period from the URL `searchParams` (shared `year`/`month`
 * with the pipeline + lead list) and renders the KPI tiles, the pipeline
 * distribution, the invoice summary, the "vendite perse" breakdown, the lead
 * source breakdown and the active-leads list.
 *
 * THREE independent, URL-driven filters coexist. Two of them pick the PERIOD
 * (mutually exclusive, see below); the third — `SourceFilter` (`sourceId`) —
 * picks the lead SOURCE and is orthogonal to both: it narrows EVERY widget,
 * including the source breakdown (which then collapses to the selected row), so
 * the whole page always reads as one coherently filtered view.
 *
 * Two INDEPENDENT, URL-driven filters coexist for the period: the year/month `PeriodFilter`
 * (shared with pipeline/lead list) and the dashboard-only `DateRangeFilter`
 * (free `from`/`to` range or the "last week" preset). When `from`/`to`/`preset`
 * are present, `resolveDateRangeBounds` wins and its bounds are threaded through
 * `periodSchema`'s `range` override to every widget query, in place of the
 * year/month bounds (docs/02 §2.2); otherwise the year/month behaviour is
 * unchanged.
 *
 * All figures come from the dashboard use cases, which compute aggregates
 * DB-side (docs/00 §3) — the page never touches Prisma. The six reads run
 * concurrently. The period defaults to the CURRENT year when no `year` param is
 * present, so the data matches the period filter's default selection.
 *
 * Responsive (docs/05 §5.7): KPI grid 5→2→1; the two middle blocks are a
 * 2-column grid on desktop and stack on mobile.
 */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = await getTranslations("dashboard");
  const sp = await searchParams;

  const ctx = await requireTenantContext();
  if (!can(ctx.role, "dashboard.view")) {
    notFound();
  }

  const flat = (key: string): string | undefined => {
    const value = sp[key];
    return Array.isArray(value) ? value.at(-1) : value;
  };

  const currentYear = new Date().getUTCFullYear();
  // Default to the current year so the data matches the period filter's default.
  const yearMonthPeriod = {
    year: flat("year") ?? String(currentYear),
    month: flat("month"),
  };

  // The free date-range filter, when active in the URL, takes precedence over
  // year/month (docs/02 §2.2). `range`, once resolved, is threaded through
  // `periodSchema` so every widget keeps a single "period input" shape.
  const dateRange = resolveDateRangeBounds({
    from: flat("from"),
    to: flat("to"),
    preset: flat("preset") === "lastWeek" ? "lastWeek" : undefined,
  });
  const period = dateRange ? { range: dateRange } : yearMonthPeriod;

  // Second, INDEPENDENT filter dimension: the lead source ("provenienza",
  // docs/02 §2.2). It is a plain opaque id (or the `UNSPECIFIED_SOURCE`
  // sentinel) validated by `dashboardFilterSchema` inside each use case — the
  // page only forwards it. Combined with the period into a single input object
  // so every widget keeps ONE entrypoint. `getActiveLeads` is not period-scoped
  // but IS source-scoped, so it receives the source alone.
  // `|| undefined` collapses an EMPTY param (`?sourceId=`, which the select
  // produces on "Tutte" before it is stripped) onto "no filter" — the schema
  // rejects the empty string rather than treating it as a wildcard.
  const sourceFilter = { sourceId: flat("sourceId") || undefined };
  const filter = { ...period, ...sourceFilter };

  const deps = buildDashboardDeps(ctx);
  const leadDeps = buildLeadDeps(ctx);

  const [
    user,
    kpis,
    distribution,
    invoiceSummary,
    lostBreakdown,
    sourceBreakdown,
    activeLeads,
    sources,
  ] = await Promise.all([
    getSessionUser(),
    getDashboardKpis(deps, filter),
    getPipelineDistribution(deps, filter),
    getInvoiceSummary(deps, filter),
    getLostBreakdown(deps, filter),
    getSourceBreakdown(deps, filter),
    getActiveLeads(deps, sourceFilter),
    // Options for the source select: the tenant's ACTIVE sources, ordered —
    // the same list the lead list/form use (one implementation, docs/00 §1).
    listLeadSources(leadDeps),
  ]);

  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-ink text-3xl">
            {t("greeting", { name: user?.name ?? "" })}
          </h1>
          <p className="text-muted">{t("subtitle")}</p>
        </div>
      </header>

      <Card>
        <CardBody className="flex flex-col gap-3">
          <PeriodFilter currentYear={currentYear} />
          <DateRangeFilter />
          <SourceFilter sources={sources} />
        </CardBody>
      </Card>

      <KpiCards kpis={kpis} />

      <PipelineDistribution distribution={distribution} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <InvoiceSummary summary={invoiceSummary} />
        <LostBreakdown breakdown={lostBreakdown} />
      </div>

      <SourceBreakdown breakdown={sourceBreakdown} />

      <ActiveLeads active={activeLeads} />
    </div>
  );
}
