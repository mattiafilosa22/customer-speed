import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";

import itMessages from "../../../messages/it.json";
import { LeadStage } from "@/generated/prisma/enums";
import { BoardContext, type BoardContextValue } from "@/components/pipeline/board-context";
import { LossReasonDialog } from "@/components/pipeline/loss-reason-dialog";

const LOSS_REASONS = [
  { id: "reason_1", label: "Non ha più risposto" },
  { id: "reason_2", label: "Prezzo troppo alto" },
];

function renderDialog(
  moveLead: BoardContextValue["moveLead"],
  props: Partial<{ open: boolean; onOpenChange: (open: boolean) => void }> = {},
) {
  const onOpenChange = props.onOpenChange ?? vi.fn();
  const utils = render(
    <NextIntlClientProvider locale="it" messages={itMessages}>
      <BoardContext.Provider value={{ moveLead, lossReasons: LOSS_REASONS }}>
        <LossReasonDialog leadId="lead_1" open={props.open ?? true} onOpenChange={onOpenChange} />
      </BoardContext.Provider>
    </NextIntlClientProvider>,
  );
  return { ...utils, onOpenChange };
}

afterEach(() => vi.clearAllMocks());

describe("LossReasonDialog", () => {
  it("includes an 'Altro' option alongside the tenant loss reasons", () => {
    renderDialog(vi.fn());
    expect(screen.getByRole("option", { name: "Non ha più risposto" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Altro" })).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("reveals a free-text input when 'Altro' is selected and requires non-empty text to confirm", () => {
    renderDialog(vi.fn());
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "__other__" } });

    const customInput = screen.getByRole("textbox", { name: "Motivo personalizzato" });
    expect(customInput).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Salva" }));
    expect(screen.getByText("Seleziona un motivo della perdita.")).toBeInTheDocument();
  });

  it("moves the lead with lossReasonCustomText (not lossReasonId) when Altro + text are confirmed", async () => {
    const moveLead = vi.fn().mockResolvedValue(undefined);
    const onOpenChange = vi.fn();
    renderDialog(moveLead, { onOpenChange });

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "__other__" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Motivo personalizzato" }), {
      target: { value: "Non risponde più alle chiamate" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salva" }));

    await waitFor(() =>
      expect(moveLead).toHaveBeenCalledWith({
        leadId: "lead_1",
        stage: LeadStage.LOST,
        lossReasonCustomText: "Non risponde più alle chiamate",
      }),
    );
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("moves the lead with lossReasonId when a listed reason is chosen", async () => {
    const moveLead = vi.fn().mockResolvedValue(undefined);
    renderDialog(moveLead);

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "reason_1" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva" }));

    await waitFor(() =>
      expect(moveLead).toHaveBeenCalledWith({
        leadId: "lead_1",
        stage: LeadStage.LOST,
        lossReasonId: "reason_1",
      }),
    );
  });

  it("has no axe violations with the free-text reason field shown", async () => {
    const { container } = renderDialog(vi.fn());
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "__other__" } });
    expect(await axe(container)).toHaveNoViolations();
  });
});
