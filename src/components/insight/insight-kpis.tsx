import { getTranslations } from "next-intl/server";

import type { InsightMonthView } from "@/server/insight";
import { Card, CardBody } from "@/components/ui";

export async function InsightKpis({ view }: { view: InsightMonthView }) {
  const t = await getTranslations("insight");
  const conversations = view.totals.welcomeSent + view.totals.outboundMessages + view.totals.inboundReceived;
  const replies = view.totals.welcomeReplies + view.totals.outboundReplies;
  const channels = [
    ["welcome", view.totals.welcomeSales, view.totals.welcomeAppointments],
    ["outbound", view.totals.outboundSales, view.totals.outboundAppointments],
    ["inbound", view.totals.inboundSales, view.totals.inboundAppointments],
  ] as const;
  const best = [...channels].sort((a, b) => b[1] - a[1] || b[2] - a[2])[0] ?? channels[0];
  const values = [
    [t("kpis.conversations"), conversations],
    [t("kpis.replies"), replies],
    [t("kpis.appointments"), view.totals.totalAppointments],
    [t("kpis.sales"), view.totals.totalSales],
    [t("kpis.bestChannel"), best[1] || best[2] ? t(`groups.${best[0]}`) : t("kpis.none")],
  ] as const;
  return (
    <section className="grid grid-cols-2 gap-3 lg:grid-cols-5" aria-label={t("titleFallback")}>
      {values.map(([label, value], index) => (
        <Card key={label} className={index === 3 ? "border-accent bg-accent text-white" : undefined}>
          <CardBody className="flex flex-col gap-1">
            <span className={`label-mono ${index === 3 ? "text-white" : "text-muted"}`}>{label}</span>
            <span className={`font-display text-3xl ${index === 3 ? "text-white" : "text-ink"}`}>{value}</span>
          </CardBody>
        </Card>
      ))}
    </section>
  );
}
