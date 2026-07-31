"use client";

import { useCallback, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

import type { ReferenceItem } from "@/server/leads";
import { Select } from "@/components/ui";
import { usePathname, useRouter } from "@/i18n/navigation";
// Imported from the leaf module, NOT the `@/server/dashboard` barrel: the barrel
// re-exports the use cases, which pull Prisma into whatever imports them. This
// file only holds zod schemas + a string constant, so it is client-safe.
import { UNSPECIFIED_SOURCE } from "@/server/dashboard/filters";

/**
 * "Provenienza" filter for the dashboard (docs/02 §2.2) — URL-driven, the SAME
 * pattern as `PeriodFilter` / `DateRangeFilter` (`router.replace` on the current
 * query string), with its OWN `sourceId` param, read/written alongside the
 * period ones. The URL stays the single source of truth, so a filtered dashboard
 * is shareable and rendered server-side.
 *
 * The param name and its values are IDENTICAL to the lead list's own source
 * filter (`lead-filters.tsx`), so the two views speak the same query language.
 *
 * Options come from the tenant's `LeadSource` rows (never an enum, never i18n) —
 * only the two synthetic entries are localized: "Tutte" (empty value = no
 * filter) and "Non specificato" (`UNSPECIFIED_SOURCE`), which selects the leads
 * with no source recorded, i.e. the same bucket the breakdown block shows.
 *
 * Accessible: a real labelled `<select>` (keyboard-operable by construction) and
 * `aria-busy` on the wrapper while the transition is pending.
 */
export function SourceFilter({ sources }: { sources: readonly ReferenceItem[] }) {
  const t = useTranslations("dashboard.sourceFilter");
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
    <div className="flex flex-wrap items-end gap-3" aria-busy={isPending}>
      <Select
        label={t("label")}
        value={params.get("sourceId") ?? ""}
        onChange={(e) => setSource(e.currentTarget.value)}
        className="w-auto min-w-[12rem] max-w-full"
      >
        <option value="">{t("all")}</option>
        {sources.map((source) => (
          <option key={source.id} value={source.id}>
            {source.label}
          </option>
        ))}
        <option value={UNSPECIFIED_SOURCE}>{t("unspecified")}</option>
      </Select>
    </div>
  );
}
