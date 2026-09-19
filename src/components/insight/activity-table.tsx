"use client";

import { useLocale, useTranslations } from "next-intl";

import type { InsightMonthView, MonthDayRow } from "@/server/insight";
import { ManualCell, type ManualField } from "@/components/insight/manual-cell";
import { DerivedCell } from "@/components/insight/derived-cell";

const cellClass = "border-b border-r border-line px-2 py-2 text-center align-middle";

function ActivityRow({ row, canEdit, sourceLabel }: { row: MonthDayRow; canEdit: boolean; sourceLabel?: string }) {
  const t = useTranslations("insight");
  const manual = (field: ManualField, label: string) => (
    <ManualCell row={row} field={field} label={label} editable={canEdit && !row.isArchived} />
  );
  const derived = (group: "welcome" | "outbound" | "inbound", metric: "appointments" | "sales") => {
    const channel = row[group];
    return (
      <DerivedCell
        date={row.date}
        group={group}
        metric={metric}
        count={channel[metric]}
        fromInsight={channel[`${metric}FromInsight`]}
        interactive={!row.isArchived && !row.isFuture}
        sourceLabel={sourceLabel}
      />
    );
  };

  return (
    <tr className={row.isArchived ? "bg-subtle" : undefined}>
      <th scope="row" className="sticky left-0 z-10 border-b border-r border-line bg-panel px-3 py-2 text-left font-mono text-sm text-ink">
        <span>{row.date.slice(-2)}</span>
        {row.isArchived ? <span className="ml-2 whitespace-nowrap text-xs text-muted">◷ {t("archive.badge")}</span> : null}
      </th>
      <td className={cellClass}>{manual("welcomeSent", `${t("groups.welcome")} ${t("columns.welcomeSent")}`)}</td>
      <td className={cellClass}>{manual("welcomeReplies", `${t("groups.welcome")} ${t("columns.replies")}`)}</td>
      <td className={cellClass}>{derived("welcome", "appointments")}</td>
      <td className={cellClass}>{derived("welcome", "sales")}</td>
      {row.isArchived ? (
        <td colSpan={2} className={cellClass}>
          <span className="block whitespace-nowrap text-xs text-muted">{t("archive.messages")}</span>
          <span className="font-mono text-sm text-ink">{row.outbound.archivedMessages ?? 0}</span>
        </td>
      ) : (
        <>
          <td className={cellClass}>{manual("outboundComments", `${t("groups.outbound")} ${t("columns.comments")}`)}</td>
          <td className={cellClass}>{manual("outboundStories", `${t("groups.outbound")} ${t("columns.stories")}`)}</td>
        </>
      )}
      <td className={cellClass}>{manual("outboundReplies", `${t("groups.outbound")} ${t("columns.replies")}`)}</td>
      <td className={cellClass}>{derived("outbound", "appointments")}</td>
      <td className={cellClass}>{derived("outbound", "sales")}</td>
      <td className={cellClass}>{manual("inboundReceived", `${t("groups.inbound")} ${t("columns.received")}`)}</td>
      <td className={cellClass}>{derived("inbound", "appointments")}</td>
      <td className={cellClass}>{derived("inbound", "sales")}</td>
      <td className={cellClass}><span className="font-mono font-semibold text-ink">{row.totalAppointments}</span></td>
      <td className={cellClass}><span className="font-mono font-semibold text-ink">{row.totalSales}</span></td>
    </tr>
  );
}

export function ActivityTable({ view, canEdit, sourceLabel }: { view: InsightMonthView; canEdit: boolean; sourceLabel?: string }) {
  const t = useTranslations("insight");
  const locale = useLocale();
  const rate = (value: number | null) => value === null ? "—" : new Intl.NumberFormat(locale, { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value);
  const totals = [
    view.totals.welcomeSent, view.totals.welcomeReplies, view.totals.welcomeAppointments, view.totals.welcomeSales,
    view.totals.outboundMessages, "", view.totals.outboundReplies, view.totals.outboundAppointments, view.totals.outboundSales,
    view.totals.inboundReceived, view.totals.inboundAppointments, view.totals.inboundSales,
    view.totals.totalAppointments, view.totals.totalSales,
  ];
  const rates = [
    "—", rate(view.rates.welcomeReplyRate), rate(view.rates.welcomeAppointmentRate), rate(view.rates.welcomeSaleRate),
    "—", "—", rate(view.rates.outboundReplyRate), rate(view.rates.outboundAppointmentRate), rate(view.rates.outboundSaleRate),
    "—", rate(view.rates.inboundAppointmentRate), rate(view.rates.inboundSaleRate), "—", rate(view.rates.overallSaleRate),
  ];

  return (
    <div className="overflow-x-auto rounded border border-line bg-panel shadow-sm">
      <table className="w-full min-w-[1320px] border-collapse font-body">
        <caption className="sr-only">{t("description")}</caption>
        <thead className="bg-subtle text-xs uppercase tracking-wide text-muted">
          <tr>
            <th rowSpan={2} scope="col" className="sticky left-0 z-20 border-b border-r border-line bg-subtle px-3 text-left">{t("columns.date")}</th>
            <th colSpan={4} scope="colgroup" className="border-b border-r border-line px-2 py-2">{t("groups.welcome")}</th>
            <th colSpan={5} scope="colgroup" className="border-b border-r border-line px-2 py-2">{t("groups.outbound")}</th>
            <th colSpan={3} scope="colgroup" className="border-b border-r border-line px-2 py-2">{t("groups.inbound")}</th>
            <th colSpan={2} scope="colgroup" className="border-b border-line px-2 py-2">{t("groups.total")}</th>
          </tr>
          <tr>
            {(["welcomeSent", "replies", "appointments", "sales", "comments", "stories", "replies", "appointments", "sales", "received", "appointments", "sales", "appointments", "sales"] as const).map((key, index) => (
              <th key={`${key}-${index}`} scope="col" className="border-b border-r border-line px-2 py-2">{t(`columns.${key}`)}</th>
            ))}
          </tr>
        </thead>
        <tbody>{view.days.map((row) => <ActivityRow key={row.date} row={row} canEdit={canEdit} sourceLabel={sourceLabel} />)}</tbody>
        <tfoot className="bg-subtle font-mono text-sm text-ink">
          {view.containsArchivedDays && view.containsLiveDays ? (
            <tr><th colSpan={15} className="border-b border-line px-3 py-2 text-left font-body text-xs text-muted">◷ {t("summary.mixedPeriod")}</th></tr>
          ) : null}
          <tr aria-label={t("summary.total")}>
            <th scope="row" className="sticky left-0 border-r border-line bg-subtle px-3 py-2 text-left font-body">{t("summary.total")}</th>
            {totals.map((value, index) => <td key={index} className={cellClass}>{value}</td>)}
          </tr>
          <tr aria-label={t("summary.conversion")}>
            <th scope="row" className="sticky left-0 border-r border-line bg-subtle px-3 py-2 text-left font-body">{t("summary.conversion")}</th>
            {rates.map((value, index) => <td key={index} className={cellClass}>{value}</td>)}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
