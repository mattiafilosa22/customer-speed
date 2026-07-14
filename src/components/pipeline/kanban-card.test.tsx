import type { ReactNode } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { DndContext } from "@dnd-kit/core";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";

import itMessages from "../../../messages/it.json";
import { AppointmentStatus, LeadStage } from "@/generated/prisma/enums";
import { formats } from "@/i18n/formats";
import type { PipelineCard } from "@/server/pipeline";
import { BoardContext, type BoardContextValue } from "@/components/pipeline/board-context";
import { KanbanCard } from "@/components/pipeline/kanban-card";
import type { StageOption } from "@/components/pipeline/move-stage-menu";

// Locale-aware navigation mock: `Link` renders a plain <a> and `useRouter`
// exposes a spyable `push` so we can assert click-to-open navigation. (Same
// rationale as other suites: next-intl's createNavigation can't load in jsdom.)
const push = vi.fn();
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push }),
  Link: ({
    href,
    children,
    ...props
  }: { href: string; children: ReactNode } & Record<string, unknown>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const CARD: PipelineCard = {
  id: "lead-1",
  firstName: "Mario",
  lastName: "Rossi",
  stage: LeadStage.TO_HANDLE,
  daysInStage: 3,
  capitalBracket: null,
  capitalAmount: null,
  source: null,
  nextAppointment: null,
};

const STAGE_OPTIONS: readonly StageOption[] = [
  { stage: LeadStage.TO_HANDLE, label: "Da gestire" },
  { stage: LeadStage.WON, label: "Vinta" },
  { stage: LeadStage.LOST, label: "Persa" },
];

function renderCard(props: Partial<Parameters<typeof KanbanCard>[0]> = {}) {
  const moveLead = vi.fn().mockResolvedValue(undefined);
  const boardValue: BoardContextValue = { moveLead, lossReasons: [] };
  const utils = render(
    // `formats`/`timeZone` mirror the real per-request config (`src/i18n/request.ts`)
    // so the "dateTime" named format used for `nextAppointment` renders the same
    // localized string as in production, not next-intl's unformatted fallback.
    <NextIntlClientProvider locale="it" messages={itMessages} formats={formats} timeZone="Europe/Rome">
      <BoardContext.Provider value={boardValue}>
        <DndContext>
          <KanbanCard card={CARD} stageOptions={STAGE_OPTIONS} canMove {...props} />
        </DndContext>
      </BoardContext.Provider>
    </NextIntlClientProvider>,
  );
  return { ...utils, moveLead };
}

describe("KanbanCard", () => {
  beforeEach(() => {
    push.mockClear();
  });

  it("renders no separate drag-handle button (the whole card is the drag surface)", () => {
    renderCard();
    // The only button is the "⋯" move menu trigger; there is no '⠿' handle.
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveAccessibleName(/sposta in un altro stage/i);
    expect(screen.queryByText("⠿")).not.toBeInTheDocument();
  });

  it("keeps the lead name as the single keyboard-navigable link to the detail", () => {
    renderCard();
    const link = screen.getByRole("link", { name: /apri il lead mario rossi/i });
    expect(link).toHaveAttribute("href", "/leads/lead-1");
    // The name is the ONLY link/tab-stop on the card (no stretched-link clone).
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });

  it("navigates to the detail on a real click (no pointer movement)", () => {
    renderCard();
    const card = screen.getByRole("article");
    fireEvent.pointerDown(card, { clientX: 100, clientY: 100 });
    fireEvent.click(card, { clientX: 102, clientY: 101 });
    expect(push).toHaveBeenCalledWith("/leads/lead-1");
  });

  it("does NOT navigate when the gesture was a drag (pointer moved past the threshold)", () => {
    renderCard();
    const card = screen.getByRole("article");
    fireEvent.pointerDown(card, { clientX: 100, clientY: 100 });
    // Click far from pointerdown (> 6px): this was a drag, not a click.
    fireEvent.click(card, { clientX: 140, clientY: 130 });
    expect(push).not.toHaveBeenCalled();
  });

  it("does NOT navigate on a click without a preceding pointerdown (e.g. a menu closing)", () => {
    renderCard();
    const card = screen.getByRole("article");
    // A bare click that did not start with a pointerdown on the card (a synthetic
    // or re-dispatched event, as a closing Radix menu can produce) must be ignored.
    fireEvent.click(card, { clientX: 100, clientY: 100 });
    expect(push).not.toHaveBeenCalled();
  });

  it("does not navigate when the click was already handled (defaultPrevented)", () => {
    renderCard();
    const card = screen.getByRole("article");
    fireEvent.pointerDown(card, { clientX: 100, clientY: 100 });
    // Build a click whose default is prevented (as dnd-kit does at drag end) and
    // dispatch it: the card's onClick must bail out.
    const clickEvent = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      clientX: 100,
      clientY: 100,
    });
    clickEvent.preventDefault();
    expect(clickEvent.defaultPrevented).toBe(true);
    card.dispatchEvent(clickEvent);
    expect(push).not.toHaveBeenCalled();
  });

  it("opens the move menu (keyboard) without the card navigating", () => {
    renderCard();
    const trigger = screen.getByRole("button", { name: /sposta in un altro stage/i });
    // A click on the trigger must never navigate (stopPropagation on the card).
    fireEvent.click(trigger);
    expect(push).not.toHaveBeenCalled();
    // Radix opens the menu on Enter (deterministic in jsdom); the menu still works.
    fireEvent.keyDown(trigger, { key: "Enter" });
    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /vinta/i })).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("selecting a menu item does NOT navigate the card (portal events do not count)", () => {
    const { moveLead } = renderCard();
    const trigger = screen.getByRole("button", { name: /sposta in un altro stage/i });
    fireEvent.keyDown(trigger, { key: "Enter" });
    // The menu content is a PORTAL: it is a React child of the card, so React
    // bubbles its pointer/click events to the article's handlers. Pressing +
    // clicking an item must NOT be mistaken for a card-body press.
    const item = screen.getByRole("menuitem", { name: /vinta/i });
    fireEvent.pointerDown(item, { clientX: 10, clientY: 10 });
    fireEvent.click(item, { clientX: 10, clientY: 10 });
    expect(push).not.toHaveBeenCalled();
    // The intended action (the move) still runs.
    expect(moveLead).toHaveBeenCalledWith({ leadId: "lead-1", stage: LeadStage.WON });
  });

  it("clicking the name link does not also fire the card navigation twice", () => {
    renderCard();
    const link = screen.getByRole("link", { name: /apri il lead mario rossi/i });
    // The Link stops propagation, so the article onClick never runs; the <a>
    // navigation itself is jsdom-inert, so push (the article path) stays unused.
    fireEvent.click(link);
    expect(push).not.toHaveBeenCalled();
  });

  it("renders the overlay clone as a static, non-interactive preview", () => {
    renderCard({ isOverlay: true });
    // No move-menu button and no link in the lifted clone.
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    // The name is shown as plain text.
    const article = screen.getByRole("article");
    expect(within(article).getByText("Mario Rossi")).toBeInTheDocument();
    // A click on the clone never navigates.
    fireEvent.click(article);
    expect(push).not.toHaveBeenCalled();
  });

  it("does not render a next-appointment row when there is none", () => {
    renderCard();
    expect(screen.queryByText(/prossimo appuntamento/i)).not.toBeInTheDocument();
  });

  it("shows the formatted date/time when a next appointment is present", () => {
    const startAt = "2026-08-20T10:30:00.000Z";
    renderCard({
      card: {
        ...CARD,
        nextAppointment: { startAt, status: AppointmentStatus.PENDING },
      },
    });
    // Accessible label ("Prossimo appuntamento:") is sr-only; the visible text
    // is the localized date/time (Europe/Rome, `formats.dateTime.dateTime`) —
    // same formatting the real per-request next-intl config produces.
    expect(screen.getByText(/prossimo appuntamento/i)).toBeInTheDocument();
    const expected = new Intl.DateTimeFormat("it", {
      ...formats.dateTime.dateTime,
      timeZone: "Europe/Rome",
    }).format(new Date(startAt));
    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it("has no axe violations, including with the next-appointment row shown", async () => {
    const { container } = renderCard({
      card: {
        ...CARD,
        nextAppointment: { startAt: "2026-08-20T10:30:00.000Z", status: AppointmentStatus.PENDING },
      },
    });
    expect(await axe(container)).toHaveNoViolations();
  });
});
