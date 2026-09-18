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
    return <span className="text-ink font-mono text-sm">{initial}</span>;
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

  // Error is a status message that appears asynchronously after blur (WCAG
  // 2.1 §4.1.3): `role="alert"` makes it an assertive live region on its own
  // (no extra `aria-live` needed) and `aria-describedby` ties it to the field
  // so a screen reader reads it together with the input, not just `aria-invalid`.
  const errorId = `${field}-${row.date}-error`;

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
        aria-describedby={error ? errorId : undefined}
        onChange={(event) => setValue(Math.max(0, Number(event.target.value)))}
        onBlur={save}
        onKeyDown={move}
        className="rounded-input border-line bg-panel text-ink focus-visible:outline-ring disabled:bg-subtle disabled:text-muted h-9 w-16 border px-2 text-center font-mono text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
      />
      {pending ? <span className="sr-only">{t("saving")}</span> : null}
      {error ? (
        <span id={errorId} role="alert" className="text-exec-ink max-w-28 text-center text-xs">
          {translateMessage(error)}
        </span>
      ) : null}
    </div>
  );
}
