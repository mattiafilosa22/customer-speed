import { getTranslations } from "next-intl/server";

import type { DashboardKpis } from "@/server/dashboard";
import { Card, CardBody } from "@/components/ui";
import { formatCurrencyWhole, formatPercent } from "@/i18n/format";

/**
 * KPI tiles (docs/02 §2.2, docs/05 §5.8 "KPI card", display font + accent fill
 * variant). Five figures: lead totals, won, lost, conversion rate, net revenue.
 *
 * Server component: localizes labels + formats currency/percentage via the
 * shared i18n formatters (no hard-coded €/% — docs/00 §6). The accent-filled
 * primary tile (net revenue) uses theme tokens only.
 *
 * Responsive (docs/05 §5.7): 5→ wraps to a 2-col grid on tablet, single column
 * on mobile; numbers stay legible (display font, large size).
 */

interface KpiTileProps {
  label: string;
  value: string;
  /** When true, the tile is the accent-filled hero variant (docs/05 §5.8). */
  fill?: boolean;
}

function KpiTile({ label, value, fill = false }: KpiTileProps) {
  return (
    <Card className={fill ? "border-accent bg-accent text-white" : undefined}>
      <CardBody className="flex flex-col gap-1">
        <span className={fill ? "label-mono text-white/80" : "label-mono text-muted"}>
          {label}
        </span>
        <span
          className={
            fill
              ? "font-display text-3xl leading-none text-white"
              : "font-display text-3xl leading-none text-ink"
          }
        >
          {value}
        </span>
      </CardBody>
    </Card>
  );
}

export async function KpiCards({ kpis }: { kpis: DashboardKpis }) {
  const t = await getTranslations("dashboard.kpis");

  const [convRate, netRevenue] = await Promise.all([
    formatPercent(kpis.convRate),
    formatCurrencyWhole(kpis.netRevenue),
  ]);

  return (
    <section aria-label={t("regionLabel")}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <KpiTile label={t("totals")} value={String(kpis.totals)} />
        <KpiTile label={t("won")} value={String(kpis.won)} />
        <KpiTile label={t("lost")} value={String(kpis.lost)} />
        <KpiTile label={t("convRate")} value={convRate} />
        <KpiTile label={t("netRevenue")} value={netRevenue} fill />
      </div>
    </section>
  );
}
