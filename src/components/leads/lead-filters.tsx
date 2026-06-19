"use client";

import { useCallback, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

import type { ReferenceItem } from "@/server/leads";
import { Input, Select } from "@/components/ui";
import { usePathname, useRouter } from "@/i18n/navigation";

/**
 * Lead list filters (search, source, sort) — URL-driven (the URL is the single
 * source of truth, so the list is shareable + SSR-rendered). On change we update
 * the query string and let the Server Component re-render. `useTransition` keeps
 * the UI responsive and signals pending state.
 *
 * The "sort" select maps the `over25/over30` presets onto the `minDays` query
 * param (+ a days_desc sort) so the contract stays just `sort` + `minDays`.
 */
export function LeadFilters({ sources }: { sources: readonly ReferenceItem[] }) {
  const t = useTranslations("leads");
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const update = useCallback(
    (mutate: (next: URLSearchParams) => void) => {
      const next = new URLSearchParams(params.toString());
      mutate(next);
      // Any filter change resets pagination to page 1.
      next.delete("page");
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

  // Combined sort value reflecting both `sort` and the `minDays` presets.
  const currentSort = params.get("minDays")
    ? `over${params.get("minDays")}`
    : (params.get("sort") ?? "default");

  const onSortChange = (value: string) =>
    update((next) => {
      if (value === "over25" || value === "over30") {
        next.set("minDays", value === "over25" ? "25" : "30");
        next.set("sort", "days_desc");
      } else {
        next.delete("minDays");
        if (value === "default") next.delete("sort");
        else next.set("sort", value);
      }
    });

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-busy={isPending}>
      <Input
        label={t("search.label")}
        type="search"
        placeholder={t("search.placeholder")}
        defaultValue={params.get("query") ?? ""}
        onChange={(e) => setParam("query", e.currentTarget.value)}
      />

      <Select
        label={t("filters.source")}
        value={params.get("sourceId") ?? ""}
        onChange={(e) => setParam("sourceId", e.currentTarget.value)}
        className="w-auto min-w-[12rem] max-w-full"
      >
        <option value="">{t("filters.allSources")}</option>
        {sources.map((source) => (
          <option key={source.id} value={source.id}>
            {source.label}
          </option>
        ))}
      </Select>

      <Select
        label={t("filters.sort")}
        value={currentSort}
        onChange={(e) => onSortChange(e.currentTarget.value)}
        className="w-auto min-w-[12rem] max-w-full"
      >
        <option value="default">{t("sort.default")}</option>
        <option value="days_asc">{t("sort.daysAsc")}</option>
        <option value="days_desc">{t("sort.daysDesc")}</option>
        <option value="over25">{t("sort.over25")}</option>
        <option value="over30">{t("sort.over30")}</option>
      </Select>
    </div>
  );
}
