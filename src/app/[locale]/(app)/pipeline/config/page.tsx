import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { requireTenantContext } from "@/lib/tenant";
import { can } from "@/lib/rbac";
import { buildPipelineDeps, getPipelineConfig } from "@/server/pipeline";
import { Card, CardBody } from "@/components/ui";
import { Link } from "@/i18n/navigation";
import { PipelineQueryProvider } from "@/components/pipeline/query-provider";
import { StageConfigPanel } from "@/components/pipeline/config/stage-config-panel";

/**
 * Pipeline configuration panel (docs/02 §2.3): show/hide stages, reorder, set
 * colour. Gated server-side by `pipeline.configureStages` (NOT baseUser) — the
 * 404 (not 403) avoids revealing the area to unauthorized roles. Mutations go
 * through Server Actions which re-enforce the capability + the domain rules.
 */
export default async function PipelineConfigPage() {
  const t = await getTranslations("pipelineConfig");

  const ctx = await requireTenantContext();
  if (!can(ctx.role, "pipeline.configureStages")) {
    notFound();
  }

  const deps = buildPipelineDeps(ctx);
  const { stages } = await getPipelineConfig(deps);

  return (
    <div className="mx-auto flex max-w-[820px] flex-col gap-4">
      <header className="flex flex-col gap-1">
        <Link href="/pipeline" className="text-accent hover:text-accent-ink label-mono w-fit">
          {t("back")}
        </Link>
        <h1 className="font-display text-3xl text-ink">{t("title")}</h1>
        <p className="text-muted">{t("description")}</p>
      </header>

      <Card>
        <CardBody>
          <PipelineQueryProvider>
            <StageConfigPanel stages={stages} />
          </PipelineQueryProvider>
        </CardBody>
      </Card>
    </div>
  );
}
