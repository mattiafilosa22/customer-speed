import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";

import itMessages from "../../../messages/it.json";
import { ChatChannel } from "@/generated/prisma/enums";

vi.mock("@/app/[locale]/(app)/insight/actions", () => ({ createLeadFromCellAction: vi.fn() }));

import { createLeadFromCellAction } from "@/app/[locale]/(app)/insight/actions";
import { NewLeadFromCellDialog } from "@/components/insight/new-lead-from-cell-dialog";

const createLeadFromCellActionMock = vi.mocked(createLeadFromCellAction);

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

  it("pre-fills the appointment date from the cell but keeps it editable", () => {
    renderDialog();
    const dateInput = screen.getByLabelText("Data appuntamento");
    expect(dateInput).toHaveValue("2026-09-10");
    expect(dateInput).not.toHaveAttribute("readonly");
  });

  it("submits the edited date + time as a single appointmentAt field", async () => {
    createLeadFromCellActionMock.mockResolvedValue({ status: "idle" });
    renderDialog();
    fireEvent.change(screen.getByLabelText("Data appuntamento"), { target: { value: "2026-09-15" } });
    fireEvent.change(screen.getByLabelText("Ora appuntamento"), { target: { value: "14:30" } });
    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Anna" } });
    fireEvent.change(screen.getByLabelText("Cognome"), { target: { value: "Rossi" } });

    fireEvent.click(screen.getByRole("button", { name: "Salva" }));

    await waitFor(() => expect(createLeadFromCellActionMock).toHaveBeenCalledTimes(1));
    const submitted = createLeadFromCellActionMock.mock.calls[0]?.[1] as FormData;
    expect(submitted.get("appointmentAt")).toBe("2026-09-15T14:30");
    expect(submitted.get("chatChannel")).toBe(ChatChannel.OUTBOUND_COMMENT);
  });

  it("has no accessibility violations", async () => {
    const { container } = renderDialog();
    expect(await axe(container)).toHaveNoViolations();
  });
});
