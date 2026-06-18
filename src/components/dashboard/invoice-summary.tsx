import { getTranslations } from "next-intl/server";

import type { InvoiceSummary as InvoiceSummaryData } from "@/server/dashboard";
import { Card, CardBody } from "@/components/ui";
import { formatCurrency } from "@/i18n/format";

/**
 * "Riepilogo fatture" (docs/02 §2.2): count + gross/net totals of the period's
 * invoices (WON leads only). Empty state when there are no invoices.
 *
 * Server component; currency via the shared i18n formatter (no hard-coded €).
 */
export async function InvoiceSummary({ summary }: { summary: InvoiceSummaryData }) {
  const t = await getTranslations("dashboard.invoices");

  const [gross, net] = await Promise.all([
    formatCurrency(summary.totalGross),
    formatCurrency(summary.totalNet),
  ]);

  return (
    <Card>
      <CardBody className="flex flex-col gap-4">
        <h2 className="font-display text-ink text-lg">{t("title")}</h2>

        {summary.count === 0 ? (
          <p className="font-body text-muted text-[13.5px]">{t("empty")}</p>
        ) : (
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="flex flex-col gap-0.5">
              <dt className="label-mono text-muted">{t("count")}</dt>
              <dd className="font-display text-ink text-2xl leading-none">{summary.count}</dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="label-mono text-muted">{t("totalGross")}</dt>
              <dd className="font-display text-ink text-2xl leading-none">{gross}</dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="label-mono text-muted">{t("totalNet")}</dt>
              <dd className="font-display text-ok text-2xl leading-none">{net}</dd>
            </div>
          </dl>
        )}
      </CardBody>
    </Card>
  );
}
