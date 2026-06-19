"use client";

import { useActionState, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { Button, Card, CardBody, Input } from "@/components/ui";
import {
  createExternalRefAction,
  deleteExternalRefAction,
} from "@/app/[locale]/(app)/leads/actions";
import { type ActionState } from "@/server/actions/action-result";
import { FormAlert } from "@/components/auth/form-alert";
import { SubmitButton } from "@/components/auth/submit-button";
import { useMessage } from "@/components/auth/use-message";

const initialState: ActionState = { status: "idle" };

export interface ExternalRefData {
  id: string;
  altName: string | null;
  altEmail: string | null;
  source: string | null;
  createdAt: Date;
}

/** Add-external-ref form: revealed by the toggle; closes/resets on success. */
function AddRefForm({ leadId, onDone }: { leadId: string; onDone: () => void }) {
  const t = useTranslations();
  const tm = useMessage();
  const locale = useLocale();
  const [state, formAction] = useActionState(createExternalRefAction, initialState);

  useEffect(() => {
    if (state.status === "success") onDone();
  }, [state.status, onDone]);

  const fieldError = (name: string): string | undefined =>
    state.status === "error" && state.fieldErrors?.[name] ? tm(state.fieldErrors[name]) : undefined;

  return (
    <form action={formAction} noValidate className="border-line flex flex-col gap-3 border-t pt-4">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="leadId" value={leadId} />

      {state.status === "error" && state.formError ? (
        <FormAlert tone="error">{tm(state.formError)}</FormAlert>
      ) : null}

      <Input
        label={t("leadDetail.externalRefs.altName")}
        name="altName"
        error={fieldError("altName")}
      />
      <Input
        label={t("leadDetail.externalRefs.altEmail")}
        name="altEmail"
        type="email"
        error={fieldError("altEmail")}
      />
      <Input
        label={t("leadDetail.externalRefs.source")}
        name="source"
        error={fieldError("source")}
      />
      <SubmitButton pendingLabel={t("leads.saving")}>
        {t("leadDetail.externalRefs.add")}
      </SubmitButton>
    </form>
  );
}

/** Read-only line within a ref; omitted entirely when the value is null. */
function RefLine({ term, value }: { term: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="label-mono text-muted">{term}</span>
      <span className="font-body text-ink text-[13.5px]">{value}</span>
    </div>
  );
}

/** Single external ref row with optional delete (when `canNote`). */
function RefItem({
  reference,
  leadId,
  canNote,
}: {
  reference: ExternalRefData;
  leadId: string;
  canNote: boolean;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const [, deleteAction] = useActionState(deleteExternalRefAction, initialState);

  return (
    <li className="border-line flex flex-col gap-2 border-t pt-3 first:border-t-0 first:pt-0">
      <RefLine term={t("leadDetail.externalRefs.altName")} value={reference.altName} />
      <RefLine term={t("leadDetail.externalRefs.altEmail")} value={reference.altEmail} />
      <RefLine term={t("leadDetail.externalRefs.source")} value={reference.source} />
      {canNote ? (
        <form action={deleteAction}>
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="refId" value={reference.id} />
          <input type="hidden" name="leadId" value={leadId} />
          <Button type="submit" variant="ghost" size="sm">
            {t("leadDetail.externalRefs.delete")}
          </Button>
        </form>
      ) : null}
    </li>
  );
}

/**
 * "Aggiornamento dati" panel (docs/02 §2.4): alternative names/emails this lead
 * is known by in the external CRM. Toggle reveals an add form (all fields
 * optional, server-validated); each ref can be removed when `canNote`.
 */
export function ExternalRefsPanel({
  leadId,
  refs,
  canNote,
}: {
  leadId: string;
  refs: readonly ExternalRefData[];
  canNote: boolean;
}) {
  const t = useTranslations();
  const [adding, setAdding] = useState(false);

  return (
    <Card>
      <CardBody className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-ink text-lg">{t("leadDetail.externalRefs.title")}</h2>
          {canNote && !adding ? (
            <Button variant="ghost" size="sm" onClick={() => setAdding(true)}>
              {t("leadDetail.externalRefs.add")}
            </Button>
          ) : null}
        </div>

        {canNote && adding ? <AddRefForm leadId={leadId} onDone={() => setAdding(false)} /> : null}

        {refs.length === 0 ? (
          <p className="font-body text-muted text-[13.5px]">{t("leadDetail.externalRefs.empty")}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {refs.map((reference) => (
              <RefItem key={reference.id} reference={reference} leadId={leadId} canNote={canNote} />
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
