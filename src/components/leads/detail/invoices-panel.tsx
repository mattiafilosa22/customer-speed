"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormatter, useLocale, useTranslations } from "next-intl";

import { Button, Card, CardBody, Input } from "@/components/ui";
import {
  createInvoiceAction,
  deleteInvoiceAction,
} from "@/app/[locale]/(app)/invoices/actions";
import { type ActionState } from "@/server/actions/action-result";
import { FormAlert } from "@/components/auth/form-alert";
import { SubmitButton } from "@/components/auth/submit-button";
import { useMessage } from "@/components/auth/use-message";

const initialState: ActionState = { status: "idle" };

export interface InvoiceItemData {
  id: string;
  number: string | null;
  /** Net amount as a fixed-2 decimal STRING (e.g. "1000.00"). */
  grossAmount: string;
  netAmount: string;
  issuedAt: Date;
}

/**
 * Minimal "Aggiungi fattura" form (docs/02 §2.5, docs/04 §4.6). Revealed by the
 * toggle; resets + closes on success. Amounts are entered as plain decimals
 * (server validates 2-decimal precision and net ≤ gross, then stores Decimal).
 * Number is optional; issue date defaults to today.
 */
function AddInvoiceForm({ leadId, onDone }: { leadId: string; onDone: () => void }) {
  const t = useTranslations("invoices");
  const tm = useMessage();
  const locale = useLocale();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction] = useActionState(createInvoiceAction, initialState);

  useEffect(() => {
    if (state.status === "success") {
      formRef.current?.reset();
      onDone();
    }
  }, [state.status, onDone]);

  const fieldError = (name: string): string | undefined =>
    state.status === "error" && state.fieldErrors?.[name] ? tm(state.fieldErrors[name]) : undefined;

  const today = new Date().toISOString().slice(0, 10);

  return (
    <form
      ref={formRef}
      action={formAction}
      noValidate
      className="border-line flex flex-col gap-3 border-t pt-4"
    >
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="leadId" value={leadId} />

      {state.status === "error" && state.formError ? (
        <FormAlert tone="error">{tm(state.formError)}</FormAlert>
      ) : null}

      <Input label={t("form.number")} name="number" error={fieldError("number")} />
      <Input
        label={t("form.grossAmount")}
        name="grossAmount"
        inputMode="decimal"
        required
        error={fieldError("grossAmount")}
      />
      <Input
        label={t("form.netAmount")}
        name="netAmount"
        inputMode="decimal"
        required
        error={fieldError("netAmount")}
      />
      <Input
        label={t("form.issuedAt")}
        name="issuedAt"
        type="date"
        defaultValue={today}
        required
        error={fieldError("issuedAt")}
      />
      <SubmitButton pendingLabel={t("form.saving")}>{t("form.submit")}</SubmitButton>
    </form>
  );
}

/** Single invoice row with optional delete. */
function InvoiceRow({
  invoice,
  amountText,
  dateText,
}: {
  invoice: InvoiceItemData;
  amountText: { gross: string; net: string };
  dateText: string;
}) {
  const t = useTranslations("invoices");
  const locale = useLocale();
  const [, deleteAction] = useActionState(deleteInvoiceAction, initialState);

  return (
    <li className="border-line flex flex-wrap items-center justify-between gap-2 border-t pt-3 first:border-t-0 first:pt-0">
      <div className="flex min-w-0 flex-col">
        <span className="font-body text-ink text-[13.5px] font-medium">
          {invoice.number ? `#${invoice.number} · ` : ""}
          {amountText.net}
        </span>
        <span className="label-mono text-muted">
          {t("row.gross")}: {amountText.gross} · {dateText}
        </span>
      </div>
      <form action={deleteAction}>
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="invoiceId" value={invoice.id} />
        <Button type="submit" variant="ghost" size="sm">
          {t("row.delete")}
        </Button>
      </form>
    </li>
  );
}

/**
 * Invoices panel for the lead detail (docs/02 §2.5). Only mounted for WON leads
 * with the `invoice.create` capability (the parent gates it server-side; the
 * action re-checks). Add form + list with per-row delete. Amounts arrive as
 * decimal strings and are localized to EUR via `useFormatter`.
 */
export function InvoicesPanel({
  leadId,
  invoices,
}: {
  leadId: string;
  invoices: readonly InvoiceItemData[];
}) {
  const t = useTranslations("invoices");
  const format = useFormatter();
  const [adding, setAdding] = useState(false);

  const money = (value: string): string =>
    format.number(Number.parseFloat(value), "currency");

  return (
    <Card>
      <CardBody className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-ink text-lg">{t("title")}</h2>
          {!adding ? (
            <Button variant="ghost" size="sm" onClick={() => setAdding(true)}>
              {t("add")}
            </Button>
          ) : null}
        </div>

        {adding ? <AddInvoiceForm leadId={leadId} onDone={() => setAdding(false)} /> : null}

        {invoices.length === 0 ? (
          <p className="font-body text-muted text-[13.5px]">{t("empty")}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {invoices.map((invoice) => (
              <InvoiceRow
                key={invoice.id}
                invoice={invoice}
                amountText={{ gross: money(invoice.grossAmount), net: money(invoice.netAmount) }}
                dateText={format.dateTime(invoice.issuedAt, "short")}
              />
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
