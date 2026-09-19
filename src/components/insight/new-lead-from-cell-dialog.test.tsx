import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";

import itMessages from "../../../messages/it.json";
import { ChatChannel } from "@/generated/prisma/enums";

vi.mock("@/app/[locale]/(app)/insight/actions", () => ({ createLeadFromCellAction: vi.fn() }));

import { NewLeadFromCellDialog } from "@/components/insight/new-lead-from-cell-dialog";

function renderDialog() {
  return render(<NextIntlClientProvider locale="it" messages={itMessages}><NewLeadFromCellDialog date="2026-09-10" channel={ChatChannel.OUTBOUND_COMMENT} sourceLabel="Instagram" open onOpenChange={vi.fn()} /></NextIntlClientProvider>);
}

describe("NewLeadFromCellDialog", () => {
  it("locks source and channel to the selected cell", () => {
    renderDialog();
    expect(screen.getByText("Instagram")).toBeInTheDocument();
    expect(screen.getByText("Commento")).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: /canale|provenienza/i })).toBeNull();
    expect(screen.getByRole("textbox", { name: "Nome" })).toBeInTheDocument();
  });

  it("has no accessibility violations", async () => {
    const { container } = renderDialog();
    expect(await axe(container)).toHaveNoViolations();
  });
});
