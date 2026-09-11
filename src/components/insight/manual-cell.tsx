"use client";

import { useState, useTransition, type KeyboardEvent } from "react";
import { useTranslations } from "next-intl";

import { saveActivityDayAction } from "@/app/[locale]/(app)/insight/actions";
import type { MonthDayRow } from "@/server/insight";
import { useMessage } from "@/components/auth/use-message";

export type ManualField =
  | "welcomeSent"
  | "welcomeReplies"
  | "outboundComments"
  | "outboundStories"
  | "outboundReplies"
  | "inboundReceived";

function counters(row: MonthDayRow): Record<ManualField, number> {
  return {
    welcomeSent: row.welcome.sent,
    welcomeReplies: row.welcome.replies,
    outboundComments: row.outbound.comments,
    outboundStories: row.outbound.stories,
    outboundReplies: row.outbound.replies,
    inboundReceived: row.inbound.received,
  };
}

export function ManualCell({
  row,
  field,
  label,
  editable,
}: {
  row: MonthDayRow;
  field: ManualField;
  label: string;
  editable: boolean;
}) {
  const t = useTranslations("insight");
  const translateMessage = useMessage();
  const initial = counters(row)[field];
  const [value, setValue] = useState(initial);
  const [lastSaved, setLastSaved] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!editable && !row.isFuture) {
    return <span className="font-mono text-sm text-ink">{initial}</span>;
  }

  function save() {
    if (row.isFuture || value === lastSaved) return;
    const form = new FormData();
    form.set("date", row.date);
    for (const [name, count] of Object.entries({ ...counters(row), [field]: value })) {
      form.set(name, String(count));
    }
    startTransition(async () => {
      const state = await saveActivityDayAction({ status: "idle" }, form);
      if (state.status === "success") {
        setLastSaved(value);
        setError(null);
      } else if (state.status === "error") {
        setError(state.fieldErrors?.[field] ?? state.formError ?? "insight.errors.generic");
      }
    });
  }

  function move(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    const selector = `[data-insight-field="${field}"]`;
    const inputs = Array.from(document.querySelectorAll<HTMLInputElement>(selector));
    const index = inputs.indexOf(event.currentTarget);
    inputs[index + (event.key === "ArrowDown" ? 1 : -1)]?.focus();
  }

  return (
    <div className="flex min-w-16 flex-col items-center gap-1">
      <input
        type="number"
        min={0}
        step={1}
        value={value}
        disabled={row.isFuture || pending}
        data-insight-field={field}
        aria-label={`${label}, ${row.date}`}
        aria-invalid={Boolean(error) || undefined}
        onChange={(event) => setValue(Math.max(0, Number(event.target.value)))}
        onBlur={save}
        onKeyDown={move}
        className="h-9 w-16 rounded-input border border-line bg-panel px-2 text-center font-mono text-sm text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:bg-subtle disabled:text-muted"
      />
      {pending ? <span className="sr-only">{t("saving")}</span> : null}
      {error ? <span className="max-w-28 text-center text-xs text-exec-ink">{translateMessage(error)}</span> : null}
    </div>
  );
}
