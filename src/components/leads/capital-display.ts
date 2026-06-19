import { useFormatter, useTranslations } from "next-intl";
import { getFormatter, getTranslations } from "next-intl/server";

import type { CapitalBracket } from "@/generated/prisma/enums";

/**
 * Shared "what to show for a lead's capital" rule (docs/02 §2.4), so the detail
 * page, the summary card and the kanban card all render it identically:
 *
 *  - when an EXACT amount is set → the localized EUR figure (the bracket stays a
 *    derived value used only for aggregates/grouping),
 *  - otherwise → the bracket's localized label,
 *  - neither set → the "non impostato" placeholder.
 *
 * Two flavours mirror the enum-label helpers:
 *  - `useCapitalDisplay()` for Client Components (hook),
 *  - `getCapitalDisplay()` for Server Components / Server Actions (async).
 */
export interface CapitalValue {
  readonly capitalAmount: number | null;
  readonly capitalBracket: CapitalBracket | null;
}

export function useCapitalDisplay(): (value: CapitalValue) => string {
  const format = useFormatter();
  const t = useTranslations();
  const bracket = useTranslations("enum.capitalBracket");
  return ({ capitalAmount, capitalBracket }) => {
    if (capitalAmount !== null) return format.number(capitalAmount, "currency");
    if (capitalBracket !== null) return bracket(capitalBracket);
    return t("leadDetail.capital.none");
  };
}

export async function getCapitalDisplay(value: CapitalValue): Promise<string> {
  const format = await getFormatter();
  if (value.capitalAmount !== null) {
    return format.number(value.capitalAmount, "currency");
  }
  if (value.capitalBracket !== null) {
    const bracket = await getTranslations("enum.capitalBracket");
    return bracket(value.capitalBracket);
  }
  const t = await getTranslations("leadDetail.capital");
  return t("none");
}
