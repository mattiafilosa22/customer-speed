"use client";

import { useActionState, useState, type ChangeEvent } from "react";
import { useLocale, useTranslations } from "next-intl";

import { Input, Segmented, Select } from "@/components/ui";
import { CapitalBracket } from "@/generated/prisma/enums";
import { useCapitalBracketLabel } from "@/i18n/enum-labels";
import { useCapitalDisplay } from "@/components/leads/capital-display";
import { setCapitalAction } from "@/app/[locale]/(app)/leads/actions";
import { type ActionState } from "@/server/actions/action-result";
import { FormAlert } from "@/components/auth/form-alert";
import { SubmitButton } from "@/components/auth/submit-button";
import { useMessage } from "@/components/auth/use-message";

const initialState: ActionState = { status: "idle" };
const CAPITAL_VALUES = Object.values(CapitalBracket);

type CapitalMode = "bracket" | "amount";

/**
 * Capital "specchietto" editor (docs/02 §2.4). The user toggles between two
 * mutually exclusive ways to set a lead's capital:
 *  - "Fascia": the bracket Select (unchanged behaviour);
 *  - "Importo esatto": a numeric € Input whose bracket is DERIVED server-side.
 *
 * The chosen mode is carried to the action via a hidden `capitalMode` field, so
 * the server only persists (and clears) the right pair. Default mode follows the
 * data: a lead with an exact amount starts in "Importo esatto".
 *
 * Capability-gated: without `lead.setCapital` we render the current value
 * read-only (the cifra when an exact amount is present, else the bracket label).
 * Accessibility: labels are associated, the Segmented is a real radiogroup, the
 * amount field is operable by keyboard with `inputmode="decimal"`, and the
 * server field error is linked via the Input's `aria-describedby` (WCAG 2.1 AA).
 */
export function CapitalSelect({
  leadId,
  capitalBracket,
  capitalAmount,
  canSetCapital,
}: {
  leadId: string;
  capitalBracket: CapitalBracket | null;
  capitalAmount: number | null;
  canSetCapital: boolean;
}) {
  const t = useTranslations();
  const tm = useMessage();
  const locale = useLocale();
  const capitalLabel = useCapitalBracketLabel();
  const capitalDisplay = useCapitalDisplay();
  const [state, formAction] = useActionState(setCapitalAction, initialState);
  const [mode, setMode] = useState<CapitalMode>(capitalAmount !== null ? "amount" : "bracket");

  if (!canSetCapital) {
    return (
      <p className="font-body text-ink text-[13.5px]">
        {capitalDisplay({ capitalAmount, capitalBracket })}
      </p>
    );
  }

  const onSelectChange = (event: ChangeEvent<HTMLSelectElement>) => {
    event.currentTarget.form?.requestSubmit();
  };

  const amountError =
    state.status === "error" && state.fieldErrors?.capitalAmount
      ? tm(state.fieldErrors.capitalAmount)
      : undefined;
  const bracketError =
    state.status === "error" && state.fieldErrors?.capitalBracket
      ? tm(state.fieldErrors.capitalBracket)
      : undefined;

  return (
    <form action={formAction} noValidate className="flex flex-col gap-2">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="leadId" value={leadId} />
      <input type="hidden" name="capitalMode" value={mode} />

      {state.status === "error" && state.formError ? (
        <FormAlert tone="error">{tm(state.formError)}</FormAlert>
      ) : null}
      {state.status === "success" && state.messageKey ? (
        <FormAlert tone="success">{tm(state.messageKey)}</FormAlert>
      ) : null}

      <Segmented<CapitalMode>
        label={t("leadDetail.capital.modeLabel")}
        value={mode}
        onValueChange={setMode}
        options={[
          { value: "bracket", label: t("leadDetail.capital.modeBracket") },
          { value: "amount", label: t("leadDetail.capital.modeAmount") },
        ]}
      />

      {mode === "bracket" ? (
        <Select
          label={t("leadDetail.capital.title")}
          hideLabel
          name="capitalBracket"
          defaultValue={capitalBracket ?? ""}
          onChange={onSelectChange}
          error={bracketError}
        >
          <option value="">{t("leadDetail.capital.none")}</option>
          {CAPITAL_VALUES.map((value) => (
            <option key={value} value={value}>
              {capitalLabel(value)}
            </option>
          ))}
        </Select>
      ) : (
        <Input
          label={t("leadDetail.capital.amountLabel")}
          name="capitalAmount"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          defaultValue={capitalAmount !== null ? String(capitalAmount) : ""}
          placeholder={t("leadDetail.capital.amountPlaceholder")}
          hint={t("leadDetail.capital.amountHint")}
          error={amountError}
        />
      )}

      {/* Inline save: small, auto-width, right-aligned (audit P1.2) — not a
          full-width bar dominating the field. */}
      <div className="flex justify-end">
        <SubmitButton size="sm" className="w-auto" pendingLabel={t("leads.saving")}>
          {t("leads.save")}
        </SubmitButton>
      </div>
    </form>
  );
}
