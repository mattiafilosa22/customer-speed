import { getTranslations } from "next-intl/server";

import type { PipelineDistributionResult } from "@/server/dashboard";
import { Card, CardBody } from "@/components/ui";
import { StagePill } from "@/components/leads/stage-pill";

/**
 * "Distribuzione pipeline" (docs/02 §2.2): one counter per VISIBLE stage. Each
 * item shows the coloured + labelled stage pill (never colour-only — WCAG 1.4.1)
 * and the count. Server component; empty state when no stage is visible.
 *
 * Responsive: a wrapping flex row of pill+count chips.
 */
export async function PipelineDistribution({
  distribution,
}: {
  distribution: PipelineDistributionResult;
}) {
  const t = await getTranslations("dashboard.distribution");

  return (
    <Card>
      <CardBody className="flex flex-col gap-4">
        <h2 className="font-display text-ink text-lg">{t("title")}</h2>

        {distribution.stages.length === 0 ? (
          <p className="font-body text-muted text-[13.5px]">{t("empty")}</p>
        ) : (
          <ul className="flex flex-wrap gap-3">
            {distribution.stages.map((item) => (
              <li
                key={item.stage}
                className="border-line flex items-center gap-2 rounded border px-3 py-2"
              >
                <StagePill stage={item.stage} />
                <span className="font-display text-ink text-xl leading-none">{item.count}</span>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
