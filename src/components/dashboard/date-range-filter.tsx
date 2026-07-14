"use client";

import { useCallback, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

import { Button, Input } from "@/components/ui";
import { usePathname, useRouter } from "@/i18n/navigation";

/**
 * Free date-range filter for the dashboard (docs/02 §2.2) — URL-driven, SAME
 * pattern as `PeriodFilter` (`router.replace` on the current query string), but
 * with its OWN `from`/`to`/`preset` params, read/written ALONGSIDE the existing
 * `year`/`month` ones (not instead of them — `period-filter.tsx` is untouched).
 *
 * Two native `<input type="date">` fields (no date-picker library, per project
 * decision) for a free range, plus two presets: "Ultima settimana" (sets
 * `preset=lastWeek`, clearing any manual `from`/`to`) and "Tutto" (clears
 * `from`/`to`/`preset`, handing control back to the year/month filter).
 *
 * When this filter is active (`from`/`to`/`preset` present in the URL), it takes
 * precedence over `PeriodFilter` server-side (`resolveDateRangeBounds` wins in
 * `dashboard/page.tsx`) — the year/month filter stays visible but becomes inert,
 * communicated via a status text (not color alone, docs/05 §5.6).
 */
export function DateRangeFilter() {
  const t = useTranslations("dashboard.dateRange");
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const update = useCallback(
    (mutate: (next: URLSearchParams) => void) => {
      const next = new URLSearchParams(params.toString());
      mutate(next);
      startTransition(() => {
        router.replace(`${pathname}?${next.toString()}`);
      });
    },
    [params, pathname, router],
  );

  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const preset = params.get("preset") ?? "";
  const isActive = Boolean(from || to || preset);

  const setLastWeek = () =>
    update((next) => {
      next.set("preset", "lastWeek");
      next.delete("from");
      next.delete("to");
    });

  const clearRange = () =>
    update((next) => {
      next.delete("preset");
      next.delete("from");
      next.delete("to");
    });

  const setFrom = (value: string) =>
    update((next) => {
      next.delete("preset");
      if (value) next.set("from", value);
      else next.delete("from");
    });

  const setTo = (value: string) =>
    update((next) => {
      next.delete("preset");
      if (value) next.set("to", value);
      else next.delete("to");
    });

  return (
    <div className="flex flex-wrap items-end gap-3" aria-busy={isPending}>
      <Input
        type="date"
        label={t("from")}
        value={from}
        onChange={(e) => setFrom(e.currentTarget.value)}
        className="w-auto"
      />
      <Input
        type="date"
        label={t("to")}
        value={to}
        onChange={(e) => setTo(e.currentTarget.value)}
        className="w-auto"
      />
      <Button
        type="button"
        variant={preset === "lastWeek" ? "default" : "ghost"}
        size="sm"
        onClick={setLastWeek}
      >
        {t("lastWeek")}
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={clearRange}>
        {t("all")}
      </Button>
      {isActive ? (
        <p role="status" className="font-body text-muted text-[12px]">
          {t("activeRangeNotice")}
        </p>
      ) : null}
    </div>
  );
}
