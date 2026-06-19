"use client";

import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

import type { AppointmentFilter } from "@/server/appointments";
import type { AppointmentTabCounts } from "@/server/appointments";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/cn";

/**
 * Status filter tabs (docs/02 §2.6): "Tutti / Da fare / Fatti", each with its
 * count. URL-driven (`?filter=`), so the active tab is derived from the URL and
 * the page is shareable/SSR-friendly. Rendered as a tablist with `aria-current`
 * so the active tab is announced (WCAG 4.1.2); the label carries TEXT, not
 * colour alone.
 */
const TABS: ReadonlyArray<{ filter: AppointmentFilter; key: keyof AppointmentTabCounts }> = [
  { filter: "all", key: "all" },
  { filter: "todo", key: "todo" },
  { filter: "done", key: "done" },
];

export function AppointmentTabs({ counts }: { counts: AppointmentTabCounts }) {
  const t = useTranslations("appointments");
  const pathname = usePathname();
  const params = useSearchParams();
  const active = (params.get("filter") as AppointmentFilter | null) ?? "all";

  const hrefFor = (filter: AppointmentFilter): string => {
    const next = new URLSearchParams(params.toString());
    if (filter === "all") next.delete("filter");
    else next.set("filter", filter);
    next.delete("page");
    const qs = next.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };

  // Active tab is more strongly marked (audit P2): accent ring + soft fill +
  // accent-ink semibold text. All token-driven; the ring avoids a border-width
  // layout shift between states.
  const tabClasses = (isActive: boolean): string =>
    cn(
      "inline-flex items-center gap-1.5 rounded-control border px-3 py-1.5 font-body text-[13px]",
      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
      isActive
        ? "border-accent bg-accent-soft text-accent-ink font-semibold ring-1 ring-accent"
        : "border-line text-muted hover:bg-accent-soft",
    );

  return (
    <div className="flex flex-wrap gap-2" role="tablist" aria-label={t("filters.label")}>
      {TABS.map(({ filter, key }) => {
        const isActive = active === filter;
        return (
          <Link
            key={filter}
            href={hrefFor(filter)}
            role="tab"
            aria-current={isActive ? "page" : undefined}
            className={tabClasses(isActive)}
          >
            <span>{t(`filters.${filter}`)}</span>
            {/* Count inherits the tab text color: accent-ink on the active
                accent-soft tab (AA), muted on the bg for inactive (AA). A flat
                text-muted would drop to ~4.45:1 on the active tint. */}
            <span className={cn("label-mono", isActive ? "text-accent-ink" : "text-muted")}>
              ({counts[key]})
            </span>
          </Link>
        );
      })}
    </div>
  );
}
