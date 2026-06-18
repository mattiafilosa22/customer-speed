"use client";

import { useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";

import { cn } from "@/lib/cn";
import { routing } from "@/i18n/routing";
import { usePathname, useRouter } from "@/i18n/navigation";

/**
 * Accessible locale selector. Switches the active locale while preserving the
 * current path: `usePathname()` from `@/i18n/navigation` returns the pathname
 * WITHOUT the locale prefix, and `router.replace(pathname, { locale })` re-adds
 * the correct prefix for the chosen locale (none for the default `it`).
 *
 * Native `<select>` is intentional: it is keyboard- and screen-reader-friendly
 * by default and works without JS-heavy menu widgets. A visible <label> (the
 * "Language" caption) names the control for assistive tech.
 *
 * Fase 0: changing the locale only navigates. Persisting the choice on
 * `User.language/locale` arrives in Fase 1 (the chosen locale would then seed
 * a Server Action); the component stays the same.
 */
export function LanguageSwitcher({ className }: { className?: string }) {
  const t = useTranslations("languageSwitcher");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  function onSelect(event: React.ChangeEvent<HTMLSelectElement>) {
    const nextLocale = event.target.value as (typeof routing.locales)[number];
    startTransition(() => {
      router.replace(pathname, { locale: nextLocale });
    });
  }

  return (
    <label
      className={cn(
        "flex items-center gap-2 font-body text-[13px] text-muted",
        className,
      )}
    >
      <span>{t("label")}</span>
      <select
        value={locale}
        onChange={onSelect}
        disabled={isPending}
        className={cn(
          "min-h-9 rounded-control border border-line bg-panel px-2 text-ink",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          "disabled:opacity-60",
        )}
      >
        {routing.locales.map((code) => (
          <option key={code} value={code}>
            {t(code)}
          </option>
        ))}
      </select>
    </label>
  );
}
