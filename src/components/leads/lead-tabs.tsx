"use client";

import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

import type { LeadStage } from "@/generated/prisma/enums";
import type { LeadListResult } from "@/server/leads";
import { STAGE_ORDER } from "@/server/leads/stage";
import { Link } from "@/i18n/navigation";
import { usePathname } from "@/i18n/navigation";
import { useLeadStageLabel } from "@/i18n/enum-labels";
import { cn } from "@/lib/cn";

/**
 * Canonical tab order (mirrors the pipeline order, docs/02 §2.3). Imported
 * directly from `@/server/leads/stage` (not the `@/server/leads` barrel,
 * which pulls in Prisma-backed use cases unsuitable for a client bundle) so
 * the ordering has a single source of truth shared with `changeStage` and
 * the pipeline config — a newly added stage can no longer be missed here.
 */
const TAB_ORDER: readonly LeadStage[] = STAGE_ORDER;

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

  // Active tab is more strongly marked (audit P2): accent ring + soft fill +
  // accent-ink semibold text — all token-driven, no layout shift between states.
  const tabClasses = (active: boolean): string =>
    cn(
      "inline-flex items-center gap-1.5 rounded-control border px-3 py-1.5 font-body text-[13px]",
      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
      active
        ? "border-accent bg-accent-soft text-accent-ink font-semibold ring-1 ring-accent"
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
