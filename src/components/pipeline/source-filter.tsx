"use client";

import { useCallback, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

import type { ReferenceItem } from "@/server/leads";
import { Select } from "@/components/ui";
import { usePathname, useRouter } from "@/i18n/navigation";

/**
 * Source (provenance) filter for the pipeline — URL-driven (`sourceId`), a mirror
 * of the lead-list source filter (docs/02 §2.3) so the two views stay coherent
 * and shareable. Server Components re-read the URL and re-fetch the board (the
 * counts respect the filter, see `getBoard`). `useTransition` keeps it responsive.
 *
 * Single Responsibility: source only — the period lives in `PeriodFilter`; both
 * update independent `searchParams`, preserving each other.
 */
export function SourceFilter({ sources }: { sources: readonly ReferenceItem[] }) {
  const t = useTranslations("pipeline.filters");
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const setSource = useCallback(
    (value: string) => {
      const next = new URLSearchParams(params.toString());
      if (value) next.set("sourceId", value);
      else next.delete("sourceId");
      startTransition(() => {
        router.replace(`${pathname}?${next.toString()}`);
      });
    },
    [params, pathname, router],
  );

  return (
    <div aria-busy={isPending}>
      <Select
        label={t("source")}
        value={params.get("sourceId") ?? ""}
        onChange={(e) => setSource(e.currentTarget.value)}
        className="w-auto min-w-[12rem]"
      >
        <option value="">{t("allSources")}</option>
        {sources.map((source) => (
          <option key={source.id} value={source.id}>
            {source.label}
          </option>
        ))}
      </Select>
    </div>
  );
}
