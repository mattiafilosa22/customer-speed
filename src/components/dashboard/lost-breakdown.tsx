import { getTranslations } from "next-intl/server";

import type { LostBreakdownResult } from "@/server/dashboard";
import { Card, CardBody, Pill } from "@/components/ui";

/**
 * "Vendite perse" (docs/02 §2.2): LOST leads grouped by loss reason, with counts,
 * most frequent first. Reasons are tenant data (already localized as stored);
 * the null-reason bucket renders a localized "Non specificato".
 *
 * Server component; empty state when there are no lost leads in the period.
 */
export async function LostBreakdown({ breakdown }: { breakdown: LostBreakdownResult }) {
  const t = await getTranslations("dashboard.lost");

  return (
    <Card>
      <CardBody className="flex flex-col gap-4">
        <h2 className="font-display text-ink text-lg">{t("title")}</h2>

        {breakdown.items.length === 0 ? (
          <p className="font-body text-muted text-[13.5px]">{t("empty")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {breakdown.items.map((item) => (
              <li
                key={item.reasonId ?? "__none__"}
                className="border-line flex items-center justify-between gap-3 border-t pt-2 first:border-t-0 first:pt-0"
              >
                <span className="font-body text-ink text-[13.5px]">
                  {item.label ?? t("unspecified")}
                </span>
                <Pill tone="exec">{item.count}</Pill>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
