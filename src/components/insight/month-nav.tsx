"use client";

import { useLocale, useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";

function adjacent(year: number, month: number, delta: number) {
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}

export function MonthNav({ year, month }: { year: number; month: number }) {
  const locale = useLocale();
  const t = useTranslations("insight.monthNav");
  const previous = adjacent(year, month, -1);
  const next = adjacent(year, month, 1);
  const label = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, 1)));
  const href = (value: { year: number; month: number }) => `/insight?year=${value.year}&month=${value.month}`;
  return (
    <nav aria-label={t("label")} className="flex items-center gap-2">
      <Link href={href(previous)} aria-label={t("previous")} className="flex min-h-11 min-w-11 items-center justify-center rounded-control border border-line text-ink hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">←</Link>
      <span className="min-w-44 text-center font-display text-xl capitalize text-ink">{label}</span>
      <Link href={href(next)} aria-label={t("next")} className="flex min-h-11 min-w-11 items-center justify-center rounded-control border border-line text-ink hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">→</Link>
    </nav>
  );
}
