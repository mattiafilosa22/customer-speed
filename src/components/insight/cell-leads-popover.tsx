"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { ChatChannel } from "@/generated/prisma/enums";
import { useLeadStageLabel } from "@/i18n/enum-labels";
import { Link } from "@/i18n/navigation";
import { listCellLeadsAction } from "@/app/[locale]/(app)/insight/actions";
import type { CellLead } from "@/server/insight";
import { stageToPill } from "@/components/leads/stage-pill-map";
import { Button, Modal, Pill } from "@/components/ui";
import { NewLeadFromCellDialog } from "@/components/insight/new-lead-from-cell-dialog";

export function CellLeadsPopover({
  date,
  group,
  metric,
  count,
  fromInsight,
  sourceLabel = "Insight & Stats",
}: {
  date: string;
  group: "welcome" | "outbound" | "inbound";
  metric: "appointments" | "sales";
  count: number;
  fromInsight: number;
  sourceLabel?: string;
}) {
  const t = useTranslations("insight");
  const stageLabel = useLeadStageLabel();
  const [open, setOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [leads, setLeads] = useState<readonly CellLead[]>([]);

  async function openList() {
    setOpen(true);
    setLoading(true);
    try {
      setLeads(await listCellLeadsAction({ date, group, metric }));
    } finally {
      setLoading(false);
    }
  }

  const channel =
    group === "welcome"
      ? ChatChannel.WELCOME
      : group === "inbound"
        ? ChatChannel.INBOUND
        : ChatChannel.OUTBOUND_COMMENT;
  const label = `${t(`columns.${metric}`)} ${t(`groups.${group}`)}, ${count || 0}, ${date}`;

  return (
    <>
      <button
        type="button"
        onClick={openList}
        aria-label={label}
        aria-describedby={`composition-${date}-${group}-${metric}`}
        className="min-h-9 min-w-9 rounded-control font-mono text-ink hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        {count === 0 ? "–" : count}
      </button>
      <span id={`composition-${date}-${group}-${metric}`} className="sr-only">
        {t("tooltip.composition", { total: count, fromInsight, other: count - fromInsight })}
      </span>
      <Modal open={open} onOpenChange={setOpen} title={t("cellLeads.title")}>
        {loading ? <p className="text-sm text-muted">{t("cellLeads.loading")}</p> : null}
        {!loading && leads.length === 0 ? (
          <p className="text-sm text-muted">{t("cellLeads.empty")}</p>
        ) : null}
        <ul className="flex flex-col divide-y divide-line">
          {leads.map((lead) => (
            <li key={lead.id} className="flex items-center justify-between gap-3 py-3">
              <Link className="font-body text-sm text-ink underline-offset-4 hover:underline" href={`/leads/${lead.id}`}>
                {lead.firstName} {lead.lastName}
              </Link>
              <Pill stage={stageToPill(lead.stage)}>{stageLabel(lead.stage)}</Pill>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted">
          {t("tooltip.composition", { total: count, fromInsight, other: count - fromInsight })}
        </p>
        <div className="flex justify-end gap-2">
          {metric === "appointments" ? (
            <Button onClick={() => { setOpen(false); setCreateOpen(true); }}>{t("cellLeads.add")}</Button>
          ) : null}
          <Button variant="ghost" onClick={() => setOpen(false)}>{t("cellLeads.close")}</Button>
        </div>
      </Modal>
      <NewLeadFromCellDialog
        date={date}
        channel={channel}
        sourceLabel={sourceLabel}
        open={createOpen}
        onOpenChange={setCreateOpen}
      />
    </>
  );
}
