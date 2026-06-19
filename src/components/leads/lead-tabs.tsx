"use client";

import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

import { LeadStage } from "@/generated/prisma/enums";
import type { LeadListResult } from "@/server/leads";
import { Link } from "@/i18n/navigation";
import { usePathname } from "@/i18n/navigation";
import { useLeadStageLabel } from "@/i18n/enum-labels";
import { cn } from "@/lib/cn";

/** Canonical tab order (mirrors the pipeline order, docs/02 §2.3). */
const TAB_ORDER: readonly LeadStage[] = [
  LeadStage.TO_HANDLE,
  LeadStage.TAKEN,
  LeadStage.CALL_SCHEDULED,
  LeadStage.WAITING_DOCS,
  LeadStage.PRESENTATION_CALL,
  LeadStage.WAITING_DECISION,
  LeadStage.WAITING_PAYMENT,
  LeadStage.WON,
  LeadStage.LOST,
];

/**
 * Status tabs (docs/02 §2.4): "Tutti (n)" + one tab per stage that has leads in
 * the current period, each with its count. URL-driven: a tab is a link that sets
 * `?stage=`; the active tab is derived from the URL. Rendered as a tablist with
 * `aria-current` so the active tab is announced (WCAG 4.1.2).
 */
export function LeadTabs({ stageCounts }: { stageCounts: LeadListResult["stageCounts"] }) {
  const t = useTranslations("leads");
  const stageLabel = useLeadStageLabel();
  const pathname = usePathname();
  const params = useSearchParams();
  const activeStage = params.get("stage");

  const hrefFor = (stage: LeadStage | null): string => {
    const next = new URLSearchParams(params.toString());
    if (stage) next.set("stage", stage);
    else next.delete("stage");
    next.delete("page");
    const qs = next.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };

  const tabClasses = (active: boolean): string =>
    cn(
      "inline-flex items-center gap-1.5 rounded-control border px-3 py-1.5 font-body text-[13px]",
      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
      active
        ? "border-accent bg-accent-soft text-accent-ink"
        : "border-line text-muted hover:bg-accent-soft",
    );

  const visibleStages = TAB_ORDER.filter((stage) => (stageCounts[stage] ?? 0) > 0);

  return (
    <div className="flex flex-wrap gap-2" role="tablist" aria-label={t("title")}>
      <Link
        href={hrefFor(null)}
        role="tab"
        aria-current={!activeStage ? "page" : undefined}
        className={tabClasses(!activeStage)}
      >
        {t("tabs.allWithCount", { count: stageCounts.all })}
      </Link>
      {visibleStages.map((stage) => (
        <Link
          key={stage}
          href={hrefFor(stage)}
          role="tab"
          aria-current={activeStage === stage ? "page" : undefined}
          className={tabClasses(activeStage === stage)}
        >
          <span>{stageLabel(stage)}</span>
          {/* Count inherits the tab color (accent-ink active / muted inactive)
              so it stays AA on the active accent-soft tint (docs/05 §5.6). */}
          <span
            className={cn(
              "label-mono",
              activeStage === stage ? "text-accent-ink" : "text-muted",
            )}
          >
            ({stageCounts[stage] ?? 0})
          </span>
        </Link>
      ))}
    </div>
  );
}
