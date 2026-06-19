"use client";

import { useCallback, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

import { Select } from "@/components/ui";
import { usePathname, useRouter } from "@/i18n/navigation";

/**
 * Period filter (year + month / "whole year") — URL-driven, with the SAME
 * `year`/`month` searchParams + semantics as the lead list (docs/02 §2.3, §2.4),
 * so the two views stay coherent and shareable. Server Components re-read the URL
 * and re-fetch; `useTransition` keeps the control responsive.
 */
const MONTH_KEYS = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
] as const;

export function PeriodFilter({ currentYear }: { currentYear: number }) {
  const t = useTranslations("pipeline.period");
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const years = [currentYear, currentYear - 1, currentYear - 2];

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

  const setParam = (key: string, value: string) =>
    update((next) => {
      if (value) next.set(key, value);
      else next.delete(key);
    });

  const selectedYear = params.get("year") ?? String(currentYear);
  const selectedMonth = params.get("month") ?? "";

  return (
    <div className="flex flex-wrap items-end gap-3" aria-busy={isPending}>
      <Select
        label={t("year")}
        value={selectedYear}
        onChange={(e) => setParam("year", e.currentTarget.value)}
        className="w-auto min-w-[7rem]"
      >
        {years.map((year) => (
          <option key={year} value={year}>
            {year}
          </option>
        ))}
      </Select>

      <Select
        label={t("month")}
        value={selectedMonth}
        onChange={(e) => setParam("month", e.currentTarget.value)}
        className="w-auto min-w-[9rem]"
      >
        <option value="">{t("allYear")}</option>
        {MONTH_KEYS.map((key, index) => (
          <option key={key} value={index + 1}>
            {t(`months.${key}`)}
          </option>
        ))}
      </Select>
    </div>
  );
}
