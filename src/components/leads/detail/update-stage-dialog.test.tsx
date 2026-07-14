import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";

import itMessages from "../../../../messages/it.json";
import { LeadStage } from "@/generated/prisma/enums";

const changeStageAction = vi.fn(async (_prev: unknown, _form: FormData) => ({
  status: "idle" as const,
}));

vi.mock("@/app/[locale]/(app)/leads/actions", () => ({
  changeStageAction: (...a: unknown[]) =>
    changeStageAction(...(a as Parameters<typeof changeStageAction>)),
}));

import { UpdateStageDialog } from "@/components/leads/detail/update-stage-dialog";

const LOSS_REASONS = [
  { id: "reason_1", label: "Non ha più risposto" },
  { id: "reason_2", label: "Prezzo troppo alto" },
];

function renderDialog() {
  return render(
    <NextIntlClientProvider locale="it" messages={itMessages}>
      <UpdateStageDialog
        leadId="lead_1"
        currentStage={LeadStage.WAITING_DECISION}
        lossReasons={LOSS_REASONS}
      />
    </NextIntlClientProvider>,
  );
}

function openDialog() {
  fireEvent.click(screen.getByRole("button", { name: "Aggiorna stage" }));
}

afterEach(() => vi.clearAllMocks());

describe("UpdateStageDialog", () => {
  it("does not show the loss-reason field for a non-LOST stage", () => {
    renderDialog();
    openDialog();
    expect(screen.queryByRole("combobox", { name: "Motivo della perdita" })).not.toBeInTheDocument();
  });

  it("shows the loss-reason Select — including an 'Altro' option — when LOST is chosen", () => {
    renderDialog();
    openDialog();

    fireEvent.change(screen.getByRole("combobox", { name: "Nuovo stage" }), {
      target: { value: LeadStage.LOST },
    });

    const reasonSelect = screen.getByRole("combobox", { name: "Motivo della perdita" });
    expect(reasonSelect).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Altro" })).toBeInTheDocument();
    // The free-text input is not shown until "Altro" is explicitly selected.
    expect(screen.queryByRole("textbox", { name: "Motivo personalizzato" })).not.toBeInTheDocument();
  });

  it('reveals a free-text input in place of lossReasonId when "Altro" is selected, and submits lossReasonCustomText', async () => {
    renderDialog();
    openDialog();

    fireEvent.change(screen.getByRole("combobox", { name: "Nuovo stage" }), {
      target: { value: LeadStage.LOST },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Motivo della perdita" }), {
      target: { value: "__other__" },
    });

    const customInput = screen.getByRole("textbox", { name: "Motivo personalizzato" });
    fireEvent.change(customInput, { target: { value: "Non risponde più alle chiamate" } });

    fireEvent.click(screen.getByRole("button", { name: "Salva" }));

    await waitFor(() => expect(changeStageAction).toHaveBeenCalledTimes(1));
    const submitted = changeStageAction.mock.calls[0]?.[1] as FormData;
    expect(submitted.get("stage")).toBe(LeadStage.LOST);
    expect(submitted.get("lossReasonCustomText")).toBe("Non risponde più alle chiamate");
    // The sentinel select must never be forwarded as a real lossReasonId.
    expect(submitted.get("lossReasonId")).toBeNull();
  });

  it("switches back to the Select (and hides the free-text input) when a real reason is chosen after Altro", () => {
    renderDialog();
    openDialog();

    fireEvent.change(screen.getByRole("combobox", { name: "Nuovo stage" }), {
      target: { value: LeadStage.LOST },
    });
    const reasonSelect = screen.getByRole("combobox", { name: "Motivo della perdita" });
    fireEvent.change(reasonSelect, { target: { value: "__other__" } });
    expect(screen.getByRole("textbox", { name: "Motivo personalizzato" })).toBeInTheDocument();

    fireEvent.change(reasonSelect, { target: { value: "reason_1" } });
    expect(screen.queryByRole("textbox", { name: "Motivo personalizzato" })).not.toBeInTheDocument();
  });

  it("has no axe violations with the free-text reason field shown", async () => {
    const { container } = renderDialog();
    openDialog();
    fireEvent.change(screen.getByRole("combobox", { name: "Nuovo stage" }), {
      target: { value: LeadStage.LOST },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Motivo della perdita" }), {
      target: { value: "__other__" },
    });
    expect(await axe(container)).toHaveNoViolations();
  });
});
