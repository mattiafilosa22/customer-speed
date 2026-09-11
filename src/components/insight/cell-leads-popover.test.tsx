import type { AnchorHTMLAttributes } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import itMessages from "../../../messages/it.json";
import { LeadStage } from "@/generated/prisma/enums";

const mocks = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock("@/app/[locale]/(app)/insight/actions", () => ({
  listCellLeadsAction: (...args: unknown[]) => mocks.list(...args),
  createLeadFromCellAction: vi.fn(),
}));
vi.mock("@/i18n/navigation", () => ({ Link: ({ href, children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) => <a href={String(href)} {...props}>{children}</a> }));

import { CellLeadsPopover } from "@/components/insight/cell-leads-popover";

function renderCell(metric: "appointments" | "sales" = "appointments") {
  return render(<NextIntlClientProvider locale="it" messages={itMessages}><CellLeadsPopover date="2026-09-07" group="welcome" metric={metric} count={2} fromInsight={1} /></NextIntlClientProvider>);
}

describe("CellLeadsPopover", () => {
  it("lists attributed leads, stage and composition", async () => {
    mocks.list.mockResolvedValue([{ id: "lead_1", firstName: "Marco", lastName: "Bianchi", stage: LeadStage.WON, createdFromInsight: true }]);
    renderCell();
    fireEvent.click(screen.getByRole("button", { name: /appuntamenti welcome/i }));
    expect(await screen.findByText("Marco Bianchi")).toBeInTheDocument();
    expect(screen.getByText("Vinta")).toBeInTheDocument();
    expect(screen.getAllByText(/1 creati.*1 inserit/i).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /aggiungi un lead/i })).toBeInTheDocument();
  });

  it("does not offer lead creation from a sales cell", async () => {
    mocks.list.mockResolvedValue([]);
    renderCell("sales");
    fireEvent.click(screen.getByRole("button", { name: /vendite welcome/i }));
    await screen.findByText(/nessun lead/i);
    expect(screen.queryByRole("button", { name: /aggiungi un lead/i })).toBeNull();
  });
});
