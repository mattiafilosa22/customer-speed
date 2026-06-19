"use client";

import { useActionState, type ChangeEvent } from "react";
import { useLocale, useTranslations } from "next-intl";

import type { ReferenceItem } from "@/server/leads";
import { Select } from "@/components/ui";
import { setSourceAction } from "@/app/[locale]/(app)/leads/actions";
import { type ActionState } from "@/server/actions/action-result";
import { FormAlert } from "@/components/auth/form-alert";
import { SubmitButton } from "@/components/auth/submit-button";
import { useMessage } from "@/components/auth/use-message";

const initialState: ActionState = { status: "idle" };

/**
 * Inline immediate-save Select for the lead source (provenienza). Mirrors
 * `CapitalSelect`: auto-submits on change with a SubmitButton fallback for the
 * no-JS / keyboard path. Source labels are tenant data (not enum), so they
 * arrive as `{ id, label }` props. Read-only text when the user cannot update.
 */
export function SourceSelect({
  leadId,
  sourceId,
  sources,
  canUpdate,
}: {
  leadId: string;
  sourceId: string | null;
  sources: readonly ReferenceItem[];
  canUpdate: boolean;
}) {
  const t = useTranslations();
  const tm = useMessage();
  const locale = useLocale();
  const [state, formAction] = useActionState(setSourceAction, initialState);

  if (!canUpdate) {
    const current = sources.find((source) => source.id === sourceId);
    return (
      <p className="font-body text-ink text-[13.5px]">
        {current ? current.label : t("leadDetail.summary.sourceNone")}
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
        label={t("leadDetail.summary.source")}
        hideLabel
        name="sourceId"
        defaultValue={sourceId ?? ""}
        onChange={onChange}
        error={
          state.status === "error" && state.fieldErrors?.sourceId
            ? tm(state.fieldErrors.sourceId)
            : undefined
        }
      >
        <option value="">{t("leadDetail.summary.sourceNone")}</option>
        {sources.map((source) => (
          <option key={source.id} value={source.id}>
            {source.label}
          </option>
        ))}
      </Select>

      <SubmitButton pendingLabel={t("leads.saving")}>{t("leads.save")}</SubmitButton>
    </form>
  );
}
