"use client";

import { useTranslations } from "next-intl";

import type { InsightMonthView, MonthDayRow } from "@/server/insight";
import { ManualCell, useDayDraft, type DayDraft, type ManualField } from "@/components/insight/manual-cell";
import { DerivedCell } from "@/components/insight/derived-cell";
import { Card, CardBody } from "@/components/ui";

export function ActivityDayCards({ view, canEdit, sourceLabel }: { view: InsightMonthView; canEdit: boolean; sourceLabel?: string }) {
  return (
    <div className="flex flex-col gap-3">
      {view.days.map((row) => <DayCard key={row.date} row={row} canEdit={canEdit} sourceLabel={sourceLabel} />)}
    </div>
  );
}

function DayCard({ row, canEdit, sourceLabel }: { row: MonthDayRow; canEdit: boolean; sourceLabel?: string }) {
  const t = useTranslations("insight");
  const draft = useDayDraft(row);

  return (
    <Card role="group" aria-label={row.date} className={new Date(`${row.date}T00:00:00.000Z`).getUTCDay() === 0 ? "bg-insight-welcome-soft" : row.isArchived ? "bg-subtle" : undefined}>
      <CardBody className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl text-ink">{row.date}</h2>
          {row.isArchived ? <span className="text-xs text-muted">◷ {t("archive.badge")}</span> : null}
        </div>
        <ChannelBlock draft={draft} title={t("groups.welcome")} row={row} canEdit={canEdit} sourceLabel={sourceLabel}
          manuals={[["welcomeSent", t("columns.welcomeSent")], ["welcomeReplies", t("columns.replies")]]}
          group="welcome" />
        <ChannelBlock draft={draft} title={t("groups.outbound")} row={row} canEdit={canEdit} sourceLabel={sourceLabel}
          manuals={row.isArchived ? [] : [["outboundComments", t("columns.comments")], ["outboundStories", t("columns.stories")], ["outboundReplies", t("columns.replies")]]}
          archivedValue={row.isArchived ? row.outbound.archivedMessages ?? 0 : undefined}
          group="outbound" />
        <ChannelBlock draft={draft} title={t("groups.inbound")} row={row} canEdit={canEdit} sourceLabel={sourceLabel}
          manuals={[["inboundReceived", t("columns.received")]]}
          group="inbound" />
      </CardBody>
    </Card>
  );
}

function ChannelBlock({ draft, title, row, canEdit, sourceLabel, manuals, group, archivedValue }: {
  draft: DayDraft;
  title: string;
  row: MonthDayRow;
  canEdit: boolean;
  sourceLabel?: string;
  manuals: readonly (readonly [ManualField, string])[];
  group: "welcome" | "outbound" | "inbound";
  archivedValue?: number;
}) {
  const t = useTranslations("insight");
  const channel = row[group];
  return (
    <section className="border-t border-line pt-3">
      <h3 className="label-mono mb-3 text-muted">{title}</h3>
      <div className="grid grid-cols-2 gap-3">
        {archivedValue === undefined ? manuals.map(([field, label]) => (
          <div key={field}><span className="mb-1 block text-xs text-muted">{label}</span><ManualCell draft={draft} field={field} label={`${title} ${label}`} editable={canEdit && !row.isArchived} /></div>
        )) : <Metric label={t("archive.messages")} value={archivedValue} />}
        <Metric label={t("columns.appointments")} value={<DerivedCell date={row.date} group={group} metric="appointments" count={channel.appointments} fromInsight={channel.appointmentsFromInsight} interactive={!row.isArchived && !row.isFuture} sourceLabel={sourceLabel} />} />
        <Metric label={t("columns.sales")} value={<DerivedCell date={row.date} group={group} metric="sales" count={channel.sales} fromInsight={channel.salesFromInsight} interactive={!row.isArchived && !row.isFuture} sourceLabel={sourceLabel} />} />
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return <div><span className="mb-1 block text-xs text-muted">{label}</span><div className="font-mono text-sm text-ink">{value}</div></div>;
}
