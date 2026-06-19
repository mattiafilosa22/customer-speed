import { getTranslations } from "next-intl/server";

import type { ReferenceItem } from "@/server/leads";
import { Card, CardBody } from "@/components/ui";
import { CapitalBracket, LeadStage } from "@/generated/prisma/enums";
import { getCapitalDisplay } from "@/components/leads/capital-display";
import { getLeadStageLabel } from "@/i18n/enum-labels";

interface LeadSummaryProps {
  stage: LeadStage;
  daysInStage: number;
  capitalBracket: CapitalBracket | null;
  capitalAmount: number | null;
  source: ReferenceItem | null;
  createdAt: string;
}

/**
 * "Sintesi" — the at-a-glance key-fact strip shown directly under the header
 * (replaces the old "scheda riassuntiva" card). READ-ONLY by design: the
 * editable controls (capital, source) live in the "Dettagli lead" card, so the
 * page never mixes display facts with editors. Each fact is a `label-mono`
 * term + an `text-ink` value (status is never colour-only), and the row wraps
 * responsively (stacks on mobile, flows on wider viewports). Server component
 * because every value is a localized label/figure.
 */
export async function LeadSummary({
  stage,
  daysInStage,
  capitalBracket,
  capitalAmount,
  source,
  createdAt,
}: LeadSummaryProps) {
  const t = await getTranslations("leadDetail.summary");
  const tl = await getTranslations("leads");

  const stageLabel = await getLeadStageLabel(stage);
  const capitalText = await getCapitalDisplay({ capitalAmount, capitalBracket });
  const sourceText = source ? source.label : "—";

  const facts: ReadonlyArray<{ term: string; value: string }> = [
    {
      term: t("stage"),
      value: `${stageLabel} · ${tl("daysInStageLabel", { count: daysInStage })}`,
    },
    { term: t("capital"), value: capitalText },
    { term: t("source"), value: sourceText },
    { term: t("createdAt"), value: createdAt },
  ];

  return (
    <Card>
      <CardBody>
        <h2 className="sr-only">{t("title")}</h2>
        <dl className="flex flex-col gap-x-8 gap-y-3 sm:flex-row sm:flex-wrap sm:items-baseline">
          {facts.map((fact) => (
            <div key={fact.term} className="flex flex-col gap-0.5">
              <dt className="label-mono text-muted">{fact.term}</dt>
              <dd className="font-body text-ink text-[13.5px]">{fact.value}</dd>
            </div>
          ))}
        </dl>
      </CardBody>
    </Card>
  );
}
