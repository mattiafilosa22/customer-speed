"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";

import { cn } from "@/lib/cn";
import { useRouter } from "@/i18n/navigation";

/**
 * Sidebar mini-calendar (docs/02 §2.6/§2.7).
 *
 * Month grid that highlights TODAY and the days that have appointments (markers
 * fetched DB-side via `/api/appointments/calendar`, never loading the rows).
 * Month navigation (prev/next) and a "today" reset. Clicking/activating a day
 * navigates to the appointments list filtered to that day (`?date=YYYY-MM-DD`).
 *
 * Accessibility (docs/00 §6, WCAG 2.1 AA):
 *  - the grid is a real `role="grid"` with `gridcell`/columnheader semantics,
 *  - roving-tabindex keyboard model (Arrows move focus, Home/End jump to row
 *    edges, PageUp/PageDown change month, Enter/Space activate),
 *  - day state is conveyed by TEXT (aria-label) + a shape marker, never colour
 *    alone (1.4.1),
 *  - prev/next/today are labelled buttons with visible focus rings.
 *
 * Time zone: day math uses the LOCAL date parts of the browser; the month
 * aggregate uses Europe/Rome on the server. For Italian users (the product's
 * audience) these coincide; the marker is a hint, the authoritative filter is the
 * list query.
 */

const WEEKDAY_REFERENCE = [
  // 2024-01-01 is a Monday; 7 consecutive days give Mon→Sun short names.
  new Date(2024, 0, 1),
  new Date(2024, 0, 2),
  new Date(2024, 0, 3),
  new Date(2024, 0, 4),
  new Date(2024, 0, 5),
  new Date(2024, 0, 6),
  new Date(2024, 0, 7),
] as const;

interface DayCell {
  /** Date for this cell (always set; cells outside the month are muted). */
  readonly date: Date;
  readonly inMonth: boolean;
  readonly day: number;
}

/** Local `YYYY-MM-DD` (no UTC shift) for the date param + comparisons. */
function isoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function sameDay(a: Date, b: Date): boolean {
  return isoDate(a) === isoDate(b);
}

/**
 * Build a 6-row (42-cell) Monday-first grid covering the given month, with
 * leading/trailing days from the adjacent months so every week is complete.
 */
function buildGrid(year: number, monthIndex: number): DayCell[] {
  const first = new Date(year, monthIndex, 1);
  // JS getDay: 0=Sun..6=Sat → Monday-first offset.
  const offset = (first.getDay() + 6) % 7;
  const start = new Date(year, monthIndex, 1 - offset);

  const cells: DayCell[] = [];
  for (let i = 0; i < 42; i += 1) {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    cells.push({ date, inMonth: date.getMonth() === monthIndex, day: date.getDate() });
  }
  return cells;
}

interface MiniCalendarProps {
  /** Called when a day is activated (used by the mobile drawer to close). */
  onNavigate?: () => void;
}

export function MiniCalendar({ onNavigate }: MiniCalendarProps) {
  const t = useTranslations("appointments.calendar");
  const format = useFormatter();
  const router = useRouter();

  const today = useMemo(() => new Date(), []);
  const [view, setView] = useState(() => ({
    year: today.getFullYear(),
    month: today.getMonth(), // 0-based
  }));
  const [markedDays, setMarkedDays] = useState<ReadonlySet<number>>(new Set());
  const [focusedIso, setFocusedIso] = useState<string>(() => isoDate(today));

  const cells = useMemo(() => buildGrid(view.year, view.month), [view]);
  const gridRef = useRef<HTMLDivElement>(null);

  // Fetch the month's appointment-day markers (DB-side aggregate). Aborts on a
  // fast month switch so a stale response cannot overwrite a newer one.
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({
      year: String(view.year),
      month: String(view.month + 1),
    });
    fetch(`/api/appointments/calendar?${params.toString()}`, {
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("calendar fetch failed"))))
      .then((data: { days?: Array<{ day: number }> }) => {
        setMarkedDays(new Set((data.days ?? []).map((d) => d.day)));
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        // Non-fatal: the calendar still renders, just without markers.
        setMarkedDays(new Set());
      });
    return () => controller.abort();
  }, [view]);

  const goMonth = useCallback((delta: number) => {
    setView((prev) => {
      const next = new Date(prev.year, prev.month + delta, 1);
      return { year: next.getFullYear(), month: next.getMonth() };
    });
  }, []);

  const goToday = useCallback(() => {
    setView({ year: today.getFullYear(), month: today.getMonth() });
    setFocusedIso(isoDate(today));
  }, [today]);

  const activateDay = useCallback(
    (date: Date) => {
      router.push(`/appointments?date=${isoDate(date)}`);
      onNavigate?.();
    },
    [router, onNavigate],
  );

  // Keyboard: move the roving focus; switch month when crossing its edges.
  const onCellKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>, date: Date) => {
      const move = (days: number) => {
        event.preventDefault();
        const next = new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
        setFocusedIso(isoDate(next));
        if (next.getMonth() !== view.month || next.getFullYear() !== view.year) {
          setView({ year: next.getFullYear(), month: next.getMonth() });
        }
      };
      switch (event.key) {
        case "ArrowLeft":
          move(-1);
          break;
        case "ArrowRight":
          move(1);
          break;
        case "ArrowUp":
          move(-7);
          break;
        case "ArrowDown":
          move(7);
          break;
        case "Home":
          move(-((date.getDay() + 6) % 7));
          break;
        case "End":
          move(6 - ((date.getDay() + 6) % 7));
          break;
        case "PageUp":
          event.preventDefault();
          goMonth(-1);
          break;
        case "PageDown":
          event.preventDefault();
          goMonth(1);
          break;
        case "Enter":
        case " ":
          event.preventDefault();
          activateDay(date);
          break;
        default:
          break;
      }
    },
    [view, goMonth, activateDay],
  );

  // After a keyboard move, pull DOM focus to the newly focused cell.
  useEffect(() => {
    const el = gridRef.current?.querySelector<HTMLButtonElement>(
      `button[data-iso="${focusedIso}"]`,
    );
    if (el && document.activeElement !== el && gridRef.current?.contains(document.activeElement)) {
      el.focus();
    }
  }, [focusedIso, cells]);

  const monthLabel = format.dateTime(new Date(view.year, view.month, 1), {
    month: "long",
    year: "numeric",
  });

  return (
    <section
      aria-label={t("title")}
      className="rounded-control border border-line bg-bg p-3"
    >
      <div className="mb-2 flex items-center justify-between gap-1">
        <button
          type="button"
          onClick={() => goMonth(-1)}
          aria-label={t("previousMonth")}
          className="inline-flex h-8 w-8 items-center justify-center rounded-control text-muted hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <span aria-hidden="true">‹</span>
        </button>
        <span className="font-body text-[13px] font-medium text-ink capitalize" aria-live="polite">
          {monthLabel}
        </span>
        <button
          type="button"
          onClick={() => goMonth(1)}
          aria-label={t("nextMonth")}
          className="inline-flex h-8 w-8 items-center justify-center rounded-control text-muted hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <span aria-hidden="true">›</span>
        </button>
      </div>

      <div ref={gridRef} role="grid" aria-label={monthLabel} className="grid grid-cols-7 gap-0.5">
        <div role="row" className="contents">
          {WEEKDAY_REFERENCE.map((ref, i) => (
            <abbr
              key={i}
              role="columnheader"
              aria-label={format.dateTime(ref, { weekday: "long" })}
              title={format.dateTime(ref, { weekday: "long" })}
              className="label-mono py-1 text-center text-[10px] text-muted no-underline"
            >
              {format.dateTime(ref, { weekday: "narrow" })}
            </abbr>
          ))}
        </div>

        {/* 6 rows of 7 cells. */}
        {Array.from({ length: 6 }, (_, rowIndex) => (
          <div role="row" key={rowIndex} className="contents">
            {cells.slice(rowIndex * 7, rowIndex * 7 + 7).map((cell) => {
              const isToday = sameDay(cell.date, today);
              const isFocused = isoDate(cell.date) === focusedIso;
              const hasAppt = cell.inMonth && markedDays.has(cell.day);
              const labelParts = [
                format.dateTime(cell.date, { day: "numeric", month: "long", year: "numeric" }),
              ];
              if (isToday) labelParts.push(t("todayLabel"));
              if (hasAppt) labelParts.push(t("hasAppointments"));

              return (
                <div role="gridcell" key={isoDate(cell.date)} className="text-center">
                  <button
                    type="button"
                    data-iso={isoDate(cell.date)}
                    tabIndex={isFocused ? 0 : -1}
                    aria-label={labelParts.join(", ")}
                    aria-current={isToday ? "date" : undefined}
                    onClick={() => activateDay(cell.date)}
                    onFocus={() => setFocusedIso(isoDate(cell.date))}
                    onKeyDown={(event) => onCellKeyDown(event, cell.date)}
                    className={cn(
                      "relative mx-auto flex h-8 w-8 items-center justify-center rounded-control font-body text-[12px]",
                      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                      cell.inMonth ? "text-ink hover:bg-accent-soft" : "text-muted/50",
                      isToday && "bg-accent text-accent-ink font-semibold",
                    )}
                  >
                    <span>{cell.day}</span>
                    {hasAppt ? (
                      <span
                        aria-hidden="true"
                        className={cn(
                          "absolute bottom-1 h-1 w-1 rounded-full",
                          isToday ? "bg-accent-ink" : "bg-accent",
                        )}
                      />
                    ) : null}
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={goToday}
        className="mt-2 w-full rounded-control py-1 font-body text-[12px] text-accent hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        {t("today")}
      </button>
    </section>
  );
}
