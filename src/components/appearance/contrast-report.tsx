"use client";

import { useTranslations } from "next-intl";

import type { ThemeContrastReport } from "@/lib/contrast";
import { FormAlert } from "@/components/auth/form-alert";

/**
 * Renders the WCAG AA contrast result for the live theme (docs/05 §5.6).
 *
 * Single responsibility: present a `ThemeContrastReport`. Errors (critical pairs)
 * and warnings (advisory pairs, e.g. muted) are shown as SEPARATE, labelled
 * alerts with the localized pair name and the numeric ratio — never color-only,
 * and announced via the alert role so the change is conveyed to assistive tech.
 */
export function ContrastReport({ report }: { report: ThemeContrastReport }) {
  const t = useTranslations("appearance.contrast");

  const errors = report.issues.filter((i) => i.severity === "error");
  const warnings = report.issues.filter((i) => i.severity === "warning");

  if (errors.length === 0 && warnings.length === 0) {
    return (
      <FormAlert tone="success">{t("passText")}</FormAlert>
    );
  }

  return (
    <div className="flex flex-col gap-2" aria-live="polite">
      {errors.length > 0 ? (
        <FormAlert tone="error">
          <span className="font-medium">{t("errorIntro")}</span>
          <ul className="mt-1 list-disc pl-4">
            {errors.map((issue) => (
              <li key={issue.pair}>
                {t(`pairs.${issue.pair}` as Parameters<typeof t>[0])}{" "}
                {t("ratio", { ratio: issue.ratio, required: issue.required })}
              </li>
            ))}
          </ul>
        </FormAlert>
      ) : null}

      {warnings.length > 0 ? (
        <FormAlert tone="warning">
          <span className="font-medium">{t("warningIntro")}</span>
          <ul className="mt-1 list-disc pl-4">
            {warnings.map((issue) => (
              <li key={issue.pair}>
                {t(`pairs.${issue.pair}` as Parameters<typeof t>[0])}{" "}
                {t("ratio", { ratio: issue.ratio, required: issue.required })}
              </li>
            ))}
          </ul>
        </FormAlert>
      ) : null}
    </div>
  );
}
