import type { InsightMonthView } from "@/server/insight";
import { ActivityDayCards } from "@/components/insight/activity-day-cards";
import { ActivityTable } from "@/components/insight/activity-table";
import { InsightKpis } from "@/components/insight/insight-kpis";
import { MonthNav } from "@/components/insight/month-nav";
import { UnattributedNotice } from "@/components/insight/unattributed-notice";

export function InsightMonth({ view, canEdit, sourceLabel }: { view: InsightMonthView; canEdit: boolean; sourceLabel: string }) {
  return (
    <div className="flex flex-col gap-4">
      <MonthNav year={view.year} month={view.month} />
      <InsightKpis view={view} />
      <UnattributedNotice count={view.unattributedLeadCount} />
      <div className="hidden sm:block"><ActivityTable view={view} canEdit={canEdit} sourceLabel={sourceLabel} /></div>
      <div className="sm:hidden"><ActivityDayCards view={view} canEdit={canEdit} sourceLabel={sourceLabel} /></div>
    </div>
  );
}
