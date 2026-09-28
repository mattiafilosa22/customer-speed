"use client";

import { useLocale, useTranslations } from "next-intl";

import { cn } from "@/lib/cn";
import type { InsightMonthView, MonthDayRow } from "@/server/insight";
import { ManualCell, type ManualField } from "@/components/insight/manual-cell";
import { DerivedCell } from "@/components/insight/derived-cell";

type Group = "welcome" | "outbound" | "inbound" | "total";
type ColumnKey = "welcomeSent" | "replies" | "appointments" | "sales" | "comments" | "stories" | "received";

/**
 * Spreadsheet-style column model: each column belongs to a channel group and
 * the LAST column of a group carries a strong right border, so the four blocks
 * (welcome / outbound / inbound / total) read as separate panels even when the
 * grid is 15 columns wide. The group colors mirror the source spreadsheet the
 * consultants already know (theme tokens `--insight-*`, mode-aware).
 */
const COLUMNS: readonly { key: ColumnKey; group: Group; last?: true }[] = [
  { key: "welcomeSent", group: "welcome" },
  { key: "replies", group: "welcome" },
  { key: "appointments", group: "welcome" },
  { key: "sales", group: "welcome", last: true },
  { key: "comments", group: "outbound" },
  { key: "stories", group: "outbound" },
  { key: "replies", group: "outbound" },
  { key: "appointments", group: "outbound" },
  { key: "sales", group: "outbound", last: true },
  { key: "received", group: "inbound" },
  { key: "appointments", group: "inbound" },
  { key: "sales", group: "inbound", last: true },
  { key: "appointments", group: "total" },
  { key: "sales", group: "total", last: true },
];

const GROUPS: readonly { group: Group; span: number }[] = [
  { group: "welcome", span: 4 },
  { group: "outbound", span: 5 },
  { group: "inbound", span: 3 },
  { group: "total", span: 2 },
];

const groupHeaderClass: Record<Group, string> = {
  welcome: "bg-insight-welcome",
  outbound: "bg-insight-outbound",
  inbound: "bg-insight-inbound",
  total: "bg-subtle",
};
const columnHeaderClass: Record<Group, string> = {
  welcome: "bg-insight-welcome-soft",
  outbound: "bg-insight-outbound-soft",
  inbound: "bg-insight-inbound-soft",
  total: "bg-subtle",
};

const cellClass = "border-b border-r border-line px-2 py-2 text-center align-middle";
const groupEndClass = "border-r-2 border-r-line-strong";
const cellAt = (index: number) => cn(cellClass, COLUMNS[index]?.last && groupEndClass);
const dateHeaderClass = "sticky left-0 z-10 border-b border-line px-3 py-2 text-left font-mono text-sm text-ink " + groupEndClass;

/** Day keys are UTC calendar days ("YYYY-MM-DD"), so the weekday is read in UTC too. */
const utcDate = (dayKey: string) => new Date(`${dayKey}T00:00:00.000Z`);
const isSunday = (dayKey: string) => utcDate(dayKey).getUTCDay() === 0;

function ActivityRow({ row, canEdit, sourceLabel }: { row: MonthDayRow; canEdit: boolean; sourceLabel?: string }) {
  const t = useTranslations("insight");
  const locale = useLocale();
  // Sundays are tinted like the spreadsheet (welcome-soft, mode-aware), archived
  // months included — the archive badge already marks those rows. The weekday
  // label is shown on every row so the tint is never the only cue.
  const weekday = new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }).format(utcDate(row.date));
  const rowTone = isSunday(row.date) ? "bg-insight-welcome-soft" : row.isArchived ? "bg-subtle" : "bg-panel";
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
    <tr className={rowTone}>
      <th scope="row" className={cn(dateHeaderClass, rowTone)}>
        <span>{row.date.slice(-2)}</span>
        <span className="ml-1.5 font-body text-xs text-muted">{weekday}</span>
        {row.isArchived ? <span className="ml-2 whitespace-nowrap text-xs text-muted">◷ {t("archive.badge")}</span> : null}
      </th>
      <td className={cellAt(0)}>{manual("welcomeSent", `${t("groups.welcome")} ${t("columns.welcomeSent")}`)}</td>
      <td className={cellAt(1)}>{manual("welcomeReplies", `${t("groups.welcome")} ${t("columns.replies")}`)}</td>
      <td className={cellAt(2)}>{derived("welcome", "appointments")}</td>
      <td className={cellAt(3)}>{derived("welcome", "sales")}</td>
      {row.isArchived ? (
        <td colSpan={2} className={cellAt(5)}>
          <span className="block whitespace-nowrap text-xs text-muted">{t("archive.messages")}</span>
          <span className="font-mono text-sm text-ink">{row.outbound.archivedMessages ?? 0}</span>
        </td>
      ) : (
        <>
          <td className={cellAt(4)}>{manual("outboundComments", `${t("groups.outbound")} ${t("columns.comments")}`)}</td>
          <td className={cellAt(5)}>{manual("outboundStories", `${t("groups.outbound")} ${t("columns.stories")}`)}</td>
        </>
      )}
      <td className={cellAt(6)}>{manual("outboundReplies", `${t("groups.outbound")} ${t("columns.replies")}`)}</td>
      <td className={cellAt(7)}>{derived("outbound", "appointments")}</td>
      <td className={cellAt(8)}>{derived("outbound", "sales")}</td>
      <td className={cellAt(9)}>{manual("inboundReceived", `${t("groups.inbound")} ${t("columns.received")}`)}</td>
      <td className={cellAt(10)}>{derived("inbound", "appointments")}</td>
      <td className={cellAt(11)}>{derived("inbound", "sales")}</td>
      <td className={cellAt(12)}><span className="font-mono font-semibold text-ink">{row.totalAppointments}</span></td>
      <td className={cellAt(13)}><span className="font-mono font-semibold text-ink">{row.totalSales}</span></td>
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

  // The wrapper is the ONE scroll container (both axes, capped to the
  // viewport): `position: sticky` only sticks relative to the nearest
  // scrolling ancestor, so a page-scrolling wrapper with `overflow-x: auto`
  // would silently disable the sticky header. Header rows stick to the top,
  // the date column to the left, totals to the bottom — like a frozen sheet.
  // `relative` makes it the containing block of the cells' `sr-only` spans
  // (absolutely positioned): otherwise they escape the overflow clip and
  // stretch the page to the full, unscrolled table height.
  return (
    <div className="relative max-h-[calc(100dvh-8rem)] overflow-auto rounded border border-line bg-panel shadow-sm">
      <table className="w-full min-w-[1320px] border-separate border-spacing-0 font-body">
        <caption className="sr-only">{t("description")}</caption>
        <thead className="sticky top-0 z-20 text-xs uppercase tracking-wide text-ink">
          <tr>
            <th rowSpan={2} scope="col" className={cn("sticky left-0 z-30 border-b-2 border-b-line-strong bg-subtle px-3 text-left", groupEndClass)}>{t("columns.date")}</th>
            {GROUPS.map(({ group, span }) => (
              <th key={group} colSpan={span} scope="colgroup" className={cn("border-b border-line px-2 py-2 font-semibold", groupHeaderClass[group], groupEndClass)}>
                {t(`groups.${group}`)}
              </th>
            ))}
          </tr>
          <tr>
            {COLUMNS.map(({ key, group, last }, index) => (
              <th key={`${key}-${index}`} scope="col" className={cn("border-b-2 border-r border-b-line-strong border-r-line px-2 py-2", columnHeaderClass[group], last && groupEndClass)}>
                {t(`columns.${key}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{view.days.map((row) => <ActivityRow key={row.date} row={row} canEdit={canEdit} sourceLabel={sourceLabel} />)}</tbody>
        <tfoot className="sticky bottom-0 z-20 bg-subtle font-mono text-sm text-ink">
          {view.containsArchivedDays && view.containsLiveDays ? (
            <tr><th colSpan={15} className="border-t-2 border-b border-t-line-strong border-b-line bg-subtle px-3 py-2 text-left font-body text-xs text-muted">◷ {t("summary.mixedPeriod")}</th></tr>
          ) : null}
          <tr aria-label={t("summary.total")}>
            <th scope="row" className={cn("sticky left-0 z-10 border-t-2 border-b border-t-line-strong border-b-line bg-subtle px-3 py-2 text-left font-body", groupEndClass)}>{t("summary.total")}</th>
            {totals.map((value, index) => <td key={index} className={cn(cellAt(index), "border-t-2 border-t-line-strong bg-subtle")}>{value}</td>)}
          </tr>
          <tr aria-label={t("summary.conversion")}>
            <th scope="row" className={cn("sticky left-0 z-10 border-r border-line bg-subtle px-3 py-2 text-left font-body", groupEndClass)}>{t("summary.conversion")}</th>
            {rates.map((value, index) => <td key={index} className={cn(cellAt(index), "bg-subtle")}>{value}</td>)}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
