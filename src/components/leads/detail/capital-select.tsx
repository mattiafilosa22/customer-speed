"use client";

import { useActionState, type ChangeEvent } from "react";
import { useLocale, useTranslations } from "next-intl";

import { Select } from "@/components/ui";
import { CapitalBracket } from "@/generated/prisma/enums";
import { useCapitalBracketLabel } from "@/i18n/enum-labels";
import { setCapitalAction } from "@/app/[locale]/(app)/leads/actions";
import { type ActionState } from "@/server/actions/action-result";
import { FormAlert } from "@/components/auth/form-alert";
import { SubmitButton } from "@/components/auth/submit-button";
import { useMessage } from "@/components/auth/use-message";

const initialState: ActionState = { status: "idle" };
const CAPITAL_VALUES = Object.values(CapitalBracket);

/**
 * Capital bracket "specchietto" (docs/02 §2.4): an inline immediate-save Select.
 * On change the form auto-submits (JS path); a visible SubmitButton is the
 * no-JS / keyboard fallback so the control is operable without relying on the
 * change handler (WCAG 2.1.1). Capability-gated: when the user cannot set the
 * capital we render the current bracket as read-only text instead of a form.
 */
export function CapitalSelect({
  leadId,
  capitalBracket,
  canSetCapital,
}: {
  leadId: string;
  capitalBracket: CapitalBracket | null;
  canSetCapital: boolean;
}) {
  const t = useTranslations();
  const tm = useMessage();
  const locale = useLocale();
  const capitalLabel = useCapitalBracketLabel();
  const [state, formAction] = useActionState(setCapitalAction, initialState);

  if (!canSetCapital) {
    return (
      <p className="font-body text-ink text-[13.5px]">
        {capitalBracket ? capitalLabel(capitalBracket) : t("leadDetail.capital.none")}
      </p>
    );
  }

  const onChange = (event: ChangeEvent<HTMLSelectElement>) => {
    event.currentTarget.form?.requestSubmit();
  };

  return (
    <form action={formAction} noValidate className="flex flex-col gap-2">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="leadId" value={leadId} />

      {state.status === "error" && state.formError ? (
        <FormAlert tone="error">{tm(state.formError)}</FormAlert>
      ) : null}
      {state.status === "success" && state.messageKey ? (
        <FormAlert tone="success">{tm(state.messageKey)}</FormAlert>
      ) : null}

      <Select
        label={t("leadDetail.capital.title")}
        hideLabel
        name="capitalBracket"
        defaultValue={capitalBracket ?? ""}
        onChange={onChange}
        error={
          state.status === "error" && state.fieldErrors?.capitalBracket
            ? tm(state.fieldErrors.capitalBracket)
            : undefined
        }
      >
        <option value="">{t("leadDetail.capital.none")}</option>
        {CAPITAL_VALUES.map((value) => (
          <option key={value} value={value}>
            {capitalLabel(value)}
          </option>
        ))}
      </Select>

      <SubmitButton pendingLabel={t("leads.saving")}>{t("leads.save")}</SubmitButton>
    </form>
  );
}
