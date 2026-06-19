import { getTranslations } from "next-intl/server";

import { Card, CardBody, EmptyState } from "@/components/ui";
import { LeadStage } from "@/generated/prisma/enums";
import { getLeadStageLabel } from "@/i18n/enum-labels";
import { formatDateShort } from "@/i18n/format";
import { StagePill } from "@/components/leads/stage-pill";

export interface StageHistoryEntry {
  id: string;
  fromStage: LeadStage | null;
  toStage: LeadStage;
  changedAt: Date;
}

interface StageTimelineProps {
  history: readonly StageHistoryEntry[];
  createdAt: Date;
}

/**
 * Stage history timeline (docs/02 §2.4). Most-recent-first ordered list; each
 * entry localizes the transition ("Da X a Y" / "Creato in Y") as TEXT, with a
 * coloured StagePill for the destination stage — status is never colour-only
 * (WCAG 1.4.1). Server component (async label/date lookups).
 */
export async function StageTimeline({ history }: StageTimelineProps) {
  const t = await getTranslations("leadDetail.timeline");

  const items = await Promise.all(
    history.map(async (entry) => {
      const toLabel = await getLeadStageLabel(entry.toStage);
      const text =
        entry.fromStage === null
          ? t("initial", { to: toLabel })
          : t("entry", { from: await getLeadStageLabel(entry.fromStage), to: toLabel });
      return { entry, text, dateText: await formatDateShort(entry.changedAt) };
    }),
  );

  return (
    <Card>
      <CardBody className="flex flex-col gap-4">
        <h2 className="font-display text-ink text-lg">{t("title")}</h2>

        {items.length === 0 ? (
          <EmptyState icon="↻" message={t("empty")} />
        ) : (
          <ol className="flex flex-col gap-3">
            {items.map(({ entry, text, dateText }) => (
              <li
                key={entry.id}
                className="border-line flex flex-col gap-1 border-t pt-3 first:border-t-0 first:pt-0"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <StagePill stage={entry.toStage} />
                  <span className="font-body text-ink text-[13.5px]">{text}</span>
                </div>
                <span className="label-mono text-muted">{dateText}</span>
              </li>
            ))}
          </ol>
        )}
      </CardBody>
    </Card>
  );
}
