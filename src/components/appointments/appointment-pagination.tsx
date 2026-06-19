"use client";

import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/cn";

/**
 * Pagination controls for the appointment list (docs/04 §4 paginated lists).
 * URL-driven (`?page=`), prev/next as links with a disabled state at the bounds.
 * Announces the current page via a live region for screen readers (WCAG 4.1.3).
 */
export function AppointmentPagination({
  page,
  pageSize,
  total,
}: {
  page: number;
  pageSize: number;
  total: number;
}) {
  const t = useTranslations("appointments.pagination");
  const pathname = usePathname();
  const params = useSearchParams();

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;

  const hrefForPage = (target: number): string => {
    const next = new URLSearchParams(params.toString());
    next.set("page", String(target));
    return `${pathname}?${next.toString()}`;
  };

  const hasPrev = page > 1;
  const hasNext = page < totalPages;

  const linkClasses = (enabled: boolean): string =>
    cn(
      "inline-flex min-h-9 items-center rounded-control border border-line px-3 font-body text-[13px]",
      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
      enabled ? "text-ink hover:bg-accent-soft" : "pointer-events-none opacity-50",
    );

  return (
    <nav className="flex items-center justify-between gap-3" aria-label={t("next")}>
      {hasPrev ? (
        <Link href={hrefForPage(page - 1)} className={linkClasses(true)} rel="prev">
          ‹ {t("previous")}
        </Link>
      ) : (
        <span className={linkClasses(false)} aria-disabled="true">
          ‹ {t("previous")}
        </span>
      )}

      <span className="font-body text-muted text-[13px]" aria-live="polite">
        {t("page", { page, total: totalPages })}
      </span>

      {hasNext ? (
        <Link href={hrefForPage(page + 1)} className={linkClasses(true)} rel="next">
          {t("next")} ›
        </Link>
      ) : (
        <span className={linkClasses(false)} aria-disabled="true">
          {t("next")} ›
        </span>
      )}
    </nav>
  );
}
