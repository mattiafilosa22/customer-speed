import type { ReactNode } from "react";
import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import itMessages from "../../../messages/it.json";
import { day, view } from "@/components/insight/test-fixtures";

vi.mock("@/app/[locale]/(app)/insight/actions", () => ({
  saveActivityDayAction: vi.fn(),
  listCellLeadsAction: vi.fn().mockResolvedValue([]),
  createLeadFromCellAction: vi.fn(),
}));
vi.mock("@/i18n/navigation", () => ({ Link: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a> }));

import { ActivityDayCards } from "@/components/insight/activity-day-cards";

function renderCards(days = [day("2026-09-07")], canEdit = true) {
  return render(<NextIntlClientProvider locale="it" messages={itMessages}><ActivityDayCards view={view(days)} canEdit={canEdit} /></NextIntlClientProvider>);
}

describe("ActivityDayCards", () => {
  it("renders one complete card per day", () => {
    renderCards([day("2026-09-07"), day("2026-09-08")]);
    const cards = screen.getAllByRole("group");
    expect(cards).toHaveLength(2);
    expect(within(cards[0]!).getByText("Welcome")).toBeInTheDocument();
    expect(within(cards[0]!).getByText("Outbound")).toBeInTheDocument();
    expect(within(cards[0]!).getByText("Inbound")).toBeInTheDocument();
  });

  it("keeps live cells editable and archive cards read-only", () => {
    const { rerender } = renderCards();
    expect(screen.getByRole("spinbutton", { name: /welcome inviati/i })).not.toBeDisabled();
    rerender(<NextIntlClientProvider locale="it" messages={itMessages}><ActivityDayCards view={view([day("2026-09-02", { isArchived: true })])} canEdit /></NextIntlClientProvider>);
    expect(screen.queryByRole("spinbutton")).toBeNull();
    expect(screen.getAllByText(/archivio/i).length).toBeGreaterThan(0);
  });
});
