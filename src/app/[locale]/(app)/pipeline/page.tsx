import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { requireTenantContext } from "@/lib/tenant";
import { can } from "@/lib/rbac";
import { buildLeadDeps, listLossReasons } from "@/server/leads";
import { buildPipelineDeps, getBoard } from "@/server/pipeline";
import { Card, CardBody } from "@/components/ui";
import { Link } from "@/i18n/navigation";
import { PeriodFilter } from "@/components/pipeline/period-filter";
import { PipelineQueryProvider } from "@/components/pipeline/query-provider";
import { PipelineBoard } from "@/components/pipeline/pipeline-board";

/**
 * Pipeline kanban (docs/02 §2.3).
 *
 * Server Component: resolves the tenant context, enforces `pipeline.view`,
 * fetches the board (visible columns, DB-side counts, capped cards) + the loss
 * reasons (for the LOST move), and hands serializable data to the client board.
 * The period filter lives in the URL (`year`/`month`), identical to the lead
 * list, so the two views stay coherent. Mutations go through Server Actions.
 */
export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = await getTranslations("pipeline");
  const sp = await searchParams;

  const ctx = await requireTenantContext();
  if (!can(ctx.role, "pipeline.view")) {
    notFound();
  }

  const flat = (key: string): string | undefined => {
    const value = sp[key];
    return Array.isArray(value) ? value.at(-1) : value;
  };

  const pipelineDeps = buildPipelineDeps(ctx);
  const leadDeps = buildLeadDeps(ctx);

  const [board, lossReasons] = await Promise.all([
    getBoard(pipelineDeps, { year: flat("year"), month: flat("month") }),
    listLossReasons(leadDeps),
  ]);

  const canMove = can(ctx.role, "pipeline.move");
  const canConfigure = can(ctx.role, "pipeline.configureStages");
  const visibleStages = board.columns.map((column) => column.stage);
  const currentYear = new Date().getUTCFullYear();

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-3xl text-ink">{t("title")}</h1>
          <p className="text-muted">{t("hint")}</p>
        </div>
        {canConfigure ? (
          <Link
            href="/pipeline/config"
            className="rounded-control bg-accent hover:bg-accent-ink focus-visible:outline-ring font-body inline-flex min-h-11 items-center px-4 font-medium text-white focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            {t("configureCta")}
          </Link>
        ) : null}
      </header>

      <Card>
        <CardBody>
          <PeriodFilter currentYear={currentYear} />
        </CardBody>
      </Card>

      {board.columns.length === 0 ? (
        <Card>
          <CardBody className="flex flex-col items-center gap-2 py-12 text-center">
            <p className="font-display text-xl text-ink">{t("empty.title")}</p>
            <p className="text-muted">{t("empty.description")}</p>
          </CardBody>
        </Card>
      ) : (
        <PipelineQueryProvider>
          <PipelineBoard
            board={board}
            visibleStages={visibleStages}
            lossReasons={lossReasons}
            canMove={canMove}
          />
        </PipelineQueryProvider>
      )}
    </div>
  );
}
