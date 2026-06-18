import { getTranslations } from "next-intl/server";

import type { ReferenceItem } from "@/server/leads";
import { Card, CardBody } from "@/components/ui";
import { CapitalBracket, LeadStage } from "@/generated/prisma/enums";
import { getCapitalBracketLabel } from "@/i18n/enum-labels";
import { StagePill } from "@/components/leads/stage-pill";
import { SourceSelect } from "@/components/leads/detail/source-select";

interface SummaryColumnProps {
  leadId: string;
  stage: LeadStage;
  stageDate: string;
  capitalBracket: CapitalBracket | null;
  sourceId: string | null;
  sources: readonly ReferenceItem[];
  canUpdate: boolean;
}

/**
 * Lead summary card ("scheda riassuntiva", docs/02 §2.4): current stage (as a
 * coloured + labelled pill — never colour-only), stage date, capital and the
 * editable source Select (client `SourceSelect`). Server component.
 */
export async function SummaryColumn({
  leadId,
  stage,
  stageDate,
  capitalBracket,
  sourceId,
  sources,
  canUpdate,
}: SummaryColumnProps) {
  const t = await getTranslations("leadDetail");
  const capitalText = capitalBracket
    ? await getCapitalBracketLabel(capitalBracket)
    : t("capital.none");

  return (
    <Card>
      <CardBody className="flex flex-col gap-4">
        <h2 className="font-display text-ink text-lg">{t("summary.title")}</h2>

        <dl className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <dt className="label-mono text-muted">{t("summary.stage")}</dt>
            <dd>
              <StagePill stage={stage} />
            </dd>
          </div>

          <div className="flex flex-col gap-0.5">
            <dt className="label-mono text-muted">{t("summary.stageDate")}</dt>
            <dd className="font-body text-ink text-[13.5px]">{stageDate}</dd>
          </div>

          <div className="flex flex-col gap-0.5">
            <dt className="label-mono text-muted">{t("summary.capital")}</dt>
            <dd className="font-body text-ink text-[13.5px]">{capitalText}</dd>
          </div>

          <div className="flex flex-col gap-1">
            <dt className="label-mono text-muted">{t("summary.source")}</dt>
            <dd>
              <SourceSelect
                leadId={leadId}
                sourceId={sourceId}
                sources={sources}
                canUpdate={canUpdate}
              />
            </dd>
          </div>
        </dl>
      </CardBody>
    </Card>
  );
}
