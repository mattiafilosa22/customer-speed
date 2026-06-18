import { getTranslations } from "next-intl/server";

import { requireTenantContext } from "@/lib/tenant";
import { can } from "@/lib/rbac";
import { buildLeadDeps, listLeads, listLeadSources } from "@/server/leads";
import { Card, CardBody } from "@/components/ui";
import { LeadFilters } from "@/components/leads/lead-filters";
import { LeadTabs } from "@/components/leads/lead-tabs";
import { LeadList } from "@/components/leads/lead-list";
import { LeadPagination } from "@/components/leads/lead-pagination";
import { NewLeadDialog } from "@/components/leads/new-lead-dialog";

/**
 * "I miei lead" — the lead list (docs/02 §2.4).
 *
 * Server Component: filters/sort/tab/page live in the URL `searchParams`
 * (shareable, SSR-friendly, no client state needed — TanStack Query would add
 * complexity with no benefit here). It resolves the tenant context, runs the
 * `listLeads` use case (one batched, paginated query set) and renders the
 * responsive list (table on >=md, cards on mobile) with stage tabs + pagination.
 */
export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = await getTranslations("leads");
  const sp = await searchParams;

  const ctx = await requireTenantContext();
  const deps = buildLeadDeps(ctx);
  const canCreate = can(ctx.role, "lead.create");

  // Normalize searchParams (last value wins for repeated keys).
  const flat = (key: string): string | undefined => {
    const value = sp[key];
    return Array.isArray(value) ? value.at(-1) : value;
  };

  const query = {
    query: flat("query"),
    stage: flat("stage"),
    sourceId: flat("sourceId"),
    year: flat("year"),
    month: flat("month"),
    minDays: flat("minDays"),
    sort: flat("sort"),
    page: flat("page"),
  };

  const [result, sources] = await Promise.all([listLeads(deps, query), listLeadSources(deps)]);

  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1>{t("title")}</h1>
          <p className="text-muted">{t("count", { count: result.total })}</p>
        </div>
        {canCreate ? <NewLeadDialog sources={sources} /> : null}
      </header>

      <Card>
        <CardBody className="flex flex-col gap-4">
          <LeadFilters sources={sources} />
          <LeadTabs stageCounts={result.stageCounts} />
        </CardBody>
      </Card>

      {result.data.length === 0 ? (
        <Card>
          <CardBody className="flex flex-col items-center gap-2 py-12 text-center">
            <p className="font-display text-xl text-ink">{t("empty.title")}</p>
            <p className="text-muted">{t("empty.description")}</p>
          </CardBody>
        </Card>
      ) : (
        <>
          <LeadList leads={result.data} />
          <LeadPagination
            page={result.page}
            pageSize={result.pageSize}
            total={result.total}
          />
        </>
      )}
    </div>
  );
}
