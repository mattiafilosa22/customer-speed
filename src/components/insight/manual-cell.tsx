"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useTranslations } from "next-intl";

import { saveActivityDayAction } from "@/app/[locale]/(app)/insight/actions";
import type { MonthDayRow } from "@/server/insight";
import { useMessage } from "@/components/auth/use-message";
import { useUnsavedChangesGuard } from "@/components/insight/unsaved-changes";

export type ManualField =
  | "welcomeSent"
  | "welcomeReplies"
  | "outboundComments"
  | "outboundStories"
  | "outboundReplies"
  | "inboundReceived";

type Counters = Record<ManualField, number>;

/** Pause after the last keystroke before saving on its own (blur/Enter save at once). */
export const SAVE_DEBOUNCE_MS = 800;
/** Same upper bound as the server `counter` schema, so a long paste never fails validation. */
const MAX_COUNTER = 100_000;

export type SaveStatus = "idle" | "unsaved" | "saving" | "saved" | "error";

function counters(row: MonthDayRow): Counters {
  return {
    welcomeSent: row.welcome.sent,
    welcomeReplies: row.welcome.replies,
    outboundComments: row.outbound.comments,
    outboundStories: row.outbound.stories,
    outboundReplies: row.outbound.replies,
    inboundReceived: row.inbound.received,
  };
}

const sameCounters = (a: Counters, b: Counters) => (Object.keys(a) as ManualField[]).every((key) => a[key] === b[key]);

export type DayDraft = ReturnType<typeof useDayDraft>;

/**
 * One draft per DAY, shared by all its manual cells, so every save carries
 * what the user currently sees in the sibling cells rather than the
 * server-rendered row, which is stale until revalidation lands.
 *
 * Saves are coalesced: a keystroke only (re)arms an 800 ms debounce, blur and
 * Enter flush immediately, and at most one request is in flight per day — edits
 * typed meanwhile are sent right after it succeeds. Inputs stay enabled while
 * saving so focus never drops out of the grid.
 */
export function useDayDraft(row: MonthDayRow) {
  const t = useTranslations("insight");
  const [values, setValues] = useState(() => counters(row));
  const [errors, setErrors] = useState<Partial<Record<ManualField, string>>>({});
  const [status, setStatus] = useState<SaveStatus>("idle");
  const valuesRef = useRef(values);
  const lastSavedRef = useRef(values);
  const lastFieldRef = useRef<ManualField>("welcomeSent");
  const inFlightRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const flush = useCallback(async (): Promise<void> => {
    clearTimeout(timerRef.current);
    if (row.isFuture || inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      // Loop rather than recurse: edits typed while a request was in flight
      // are sent as soon as it lands, until what is on screen is persisted.
      while (!sameCounters(valuesRef.current, lastSavedRef.current)) {
        const snapshot = valuesRef.current;
        const field = lastFieldRef.current;
        const form = new FormData();
        form.set("date", row.date);
        for (const [name, count] of Object.entries(snapshot)) form.set(name, String(count));

        setStatus("saving");
        let state: Awaited<ReturnType<typeof saveActivityDayAction>> | undefined;
        try {
          state = await saveActivityDayAction({ status: "idle" }, form);
        } catch {
          // Network drop / server crash: keep the edit and report it, never lose it silently.
          state = undefined;
        }

        if (state?.status !== "success") {
          const fieldErrors = (state?.status === "error" ? state.fieldErrors ?? {} : {}) as Partial<Record<ManualField, string>>;
          const formError = (state?.status === "error" && state.formError) || "insight.errors.generic";
          setErrors(Object.keys(fieldErrors).length > 0 ? fieldErrors : { [field]: formError });
          setStatus("error");
          return;
        }
        lastSavedRef.current = snapshot;
        setErrors({});
        setStatus("saved");
      }
    } finally {
      inFlightRef.current = false;
    }
  }, [row.date, row.isFuture]);

  const set = useCallback((field: ManualField, value: number) => {
    const next = { ...valuesRef.current, [field]: value };
    valuesRef.current = next;
    lastFieldRef.current = field;
    setValues(next);
    clearTimeout(timerRef.current);
    if (inFlightRef.current) return; // the in-flight save picks the edit up when it lands
    if (sameCounters(next, lastSavedRef.current)) {
      // Back to what the server holds: nothing is pending any more.
      setErrors({});
      setStatus((current) => (current === "unsaved" || current === "error" ? "idle" : current));
      return;
    }
    setStatus("unsaved");
    timerRef.current = setTimeout(() => void flush(), SAVE_DEBOUNCE_MS);
  }, [flush]);

  // Leaving the page in-app unmounts the draft: send what is still pending.
  const flushRef = useRef(flush);
  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);
  useEffect(() => () => void flushRef.current(), []);

  useUnsavedChangesGuard(
    status === "error" ? "failed" : status === "unsaved" || status === "saving" ? "unsaved" : "clean",
    t("saveStatus.leaveWarning"),
  );

  return { row, values, errors, status, set, flush };
}

/** Visible + announced per-day save state; text, not color, carries the meaning. */
export function SaveStatusText({ status }: { status: SaveStatus }) {
  const t = useTranslations("insight.saveStatus");
  return (
    <span role="status" className="block text-xs font-body font-normal normal-case tracking-normal text-ink">
      {status === "idle" ? null : t(status)}
    </span>
  );
}

const fieldSelector = "input[data-insight-field]";

/** Moves focus like a spreadsheet: up/down within the same column, left/right within the day. */
function focusNeighbour(input: HTMLInputElement, direction: "up" | "down" | "left" | "right") {
  const vertical = direction === "up" || direction === "down";
  const scope = input.closest(vertical ? "[data-insight-grid]" : "[data-insight-day]");
  if (!scope) return false;
  const selector = vertical ? `input[data-insight-field="${input.dataset.insightField}"]` : fieldSelector;
  const inputs = Array.from(scope.querySelectorAll<HTMLInputElement>(selector)).filter((candidate) => !candidate.disabled);
  const target = inputs[inputs.indexOf(input) + (direction === "down" || direction === "right" ? 1 : -1)];
  if (!target) return false;
  target.focus();
  return true;
}

export function ManualCell({
  draft,
  field,
  label,
  editable,
}: {
  draft: DayDraft;
  field: ManualField;
  label: string;
  editable: boolean;
}) {
  const translateMessage = useMessage();
  const { row } = draft;
  const value = draft.values[field];
  const error = draft.errors[field] ?? null;
  // Raw text while editing, so an emptied field stays empty instead of
  // snapping back to "0" under the caret; it is saved as 0.
  const [text, setText] = useState<string | null>(null);

  if (!editable && !row.isFuture) {
    return <span className="text-ink font-mono text-base tabular-nums">{value}</span>;
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    if (event.key === "Enter") {
      event.preventDefault();
      void draft.flush();
      focusNeighbour(input, event.shiftKey ? "up" : "down");
      return;
    }
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      focusNeighbour(input, event.key === "ArrowUp" ? "up" : "down");
      return;
    }
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      // Only leave the cell once the caret is at the edge (or the whole value
      // is selected, as after focus), so arrows still move inside the digits.
      const start = input.selectionStart ?? 0;
      const end = input.selectionEnd ?? 0;
      const allSelected = start === 0 && end === input.value.length;
      const atEdge = event.key === "ArrowLeft" ? end === 0 : start === input.value.length;
      if ((allSelected || atEdge) && focusNeighbour(input, event.key === "ArrowLeft" ? "left" : "right")) event.preventDefault();
    }
  }

  // Error is a status message that appears asynchronously after blur (WCAG
  // 2.1 §4.1.3): `role="alert"` makes it an assertive live region on its own
  // (no extra `aria-live` needed) and `aria-describedby` ties it to the field
  // so a screen reader reads it together with the input, not just `aria-invalid`.
  const errorId = `${field}-${row.date}-error`;

  return (
    <div className="flex min-w-20 flex-col items-center gap-1">
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        enterKeyHint="next"
        value={text ?? String(value)}
        disabled={row.isFuture}
        data-insight-field={field}
        aria-label={`${label}, ${row.date}`}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={error ? errorId : undefined}
        onChange={(event) => {
          const digits = event.target.value.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
          setText(digits);
          draft.set(field, Math.min(MAX_COUNTER, Number(digits || 0)));
        }}
        // Select on focus so typing replaces the value instead of appending to it.
        onFocus={(event) => event.currentTarget.select()}
        onBlur={() => {
          setText(null);
          void draft.flush();
        }}
        onKeyDown={onKeyDown}
        className="rounded-input border-muted bg-panel text-ink focus-visible:outline-ring disabled:bg-subtle disabled:text-muted h-10 w-20 border px-2 text-center font-mono text-base tabular-nums focus-visible:outline-2 focus-visible:outline-offset-2"
      />
      {error ? (
        <span id={errorId} role="alert" className="text-exec-ink max-w-28 text-center text-xs">
          {translateMessage(error)}
        </span>
      ) : null}
    </div>
  );
}
