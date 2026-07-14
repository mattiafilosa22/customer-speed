import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";

import itMessages from "../../../messages/it.json";
import type { LossReasonItem } from "@/server/loss-reasons";

const createLossReasonAction = vi.fn();
const updateLossReasonAction = vi.fn();
const toggleLossReasonActiveAction = vi.fn();
const reorderLossReasonsAction = vi.fn();

vi.mock("@/app/[locale]/(app)/settings/loss-reasons/actions", () => ({
  createLossReasonAction: (...a: unknown[]) => createLossReasonAction(...a),
  updateLossReasonAction: (...a: unknown[]) => updateLossReasonAction(...a),
  toggleLossReasonActiveAction: (...a: unknown[]) => toggleLossReasonActiveAction(...a),
  reorderLossReasonsAction: (...a: unknown[]) => reorderLossReasonsAction(...a),
}));

import { LossReasonsPanel } from "@/components/settings/loss-reasons-panel";

const REASONS: LossReasonItem[] = [
  { id: "loss_1", label: "Budget insufficiente", isActive: true, sortOrder: 0 },
  { id: "loss_2", label: "Non risponde", isActive: true, sortOrder: 1 },
  { id: "loss_3", label: "Ha scelto un competitor", isActive: false, sortOrder: 2 },
];

function renderPanel(initialReasons: LossReasonItem[] = REASONS) {
  return render(
    <NextIntlClientProvider locale="it" messages={itMessages}>
      <LossReasonsPanel initialReasons={initialReasons} />
    </NextIntlClientProvider>,
  );
}

afterEach(() => vi.clearAllMocks());

describe("LossReasonsPanel", () => {
  it("renders each reason with its label and active/inactive status", () => {
    renderPanel();
    expect(screen.getByText("Budget insufficiente")).toBeInTheDocument();
    expect(screen.getByText("Non risponde")).toBeInTheDocument();
    expect(screen.getByText("Ha scelto un competitor")).toBeInTheDocument();
    expect(screen.getAllByText("Attivo")).toHaveLength(2);
    expect(screen.getByText("Disattivato")).toBeInTheDocument();
  });

  it("shows the empty state when the tenant has no loss reasons yet", () => {
    renderPanel([]);
    expect(screen.getByText("Nessun motivo di perdita configurato.")).toBeInTheDocument();
  });

  it("disables the top row's 'move up' and the bottom row's 'move down'", () => {
    renderPanel();
    expect(
      screen.getByRole("button", { name: "Sposta in alto: Budget insufficiente" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Sposta in basso: Ha scelto un competitor" }),
    ).toBeDisabled();
  });

  it("moves a reason down and persists the new full order", async () => {
    reorderLossReasonsAction.mockResolvedValue({ order: ["loss_2", "loss_1", "loss_3"] });
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "Sposta in basso: Budget insufficiente" }));

    await waitFor(() =>
      expect(reorderLossReasonsAction).toHaveBeenCalledWith({
        order: ["loss_2", "loss_1", "loss_3"],
      }),
    );
  });

  it("rolls back and shows a localized error when reorder fails", async () => {
    reorderLossReasonsAction.mockRejectedValue(new Error("lossReasons.errors.generic"));
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "Sposta in basso: Budget insufficiente" }));

    expect(await screen.findByText("Operazione non riuscita. Riprova.")).toBeInTheDocument();
  });

  it("renames a reason via the inline edit form", async () => {
    updateLossReasonAction.mockResolvedValue({
      id: "loss_1",
      label: "Budget non sufficiente",
      isActive: true,
      sortOrder: 0,
    });
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "Rinomina: Budget insufficiente" }));
    const field = screen.getByLabelText("Nuova etichetta per Budget insufficiente");
    fireEvent.change(field, { target: { value: "Budget non sufficiente" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva" }));

    await waitFor(() =>
      expect(updateLossReasonAction).toHaveBeenCalledWith({
        id: "loss_1",
        label: "Budget non sufficiente",
      }),
    );
    expect(await screen.findByText("Budget non sufficiente")).toBeInTheDocument();
  });

  it("cancels an in-progress rename without calling the action", () => {
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "Rinomina: Budget insufficiente" }));
    fireEvent.click(screen.getByRole("button", { name: "Annulla" }));

    expect(updateLossReasonAction).not.toHaveBeenCalled();
    expect(screen.getByText("Budget insufficiente")).toBeInTheDocument();
  });

  it("deactivates an active reason", async () => {
    toggleLossReasonActiveAction.mockResolvedValue({
      id: "loss_1",
      label: "Budget insufficiente",
      isActive: false,
      sortOrder: 0,
    });
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "Disattiva: Budget insufficiente" }));

    await waitFor(() =>
      expect(toggleLossReasonActiveAction).toHaveBeenCalledWith({
        id: "loss_1",
        isActive: false,
      }),
    );
    expect(
      await screen.findByRole("button", { name: "Riattiva: Budget insufficiente" }),
    ).toBeInTheDocument();
  });

  it("reactivates a deactivated reason", async () => {
    toggleLossReasonActiveAction.mockResolvedValue({
      id: "loss_3",
      label: "Ha scelto un competitor",
      isActive: true,
      sortOrder: 2,
    });
    renderPanel();

    fireEvent.click(
      screen.getByRole("button", { name: "Riattiva: Ha scelto un competitor" }),
    );

    await waitFor(() =>
      expect(toggleLossReasonActiveAction).toHaveBeenCalledWith({
        id: "loss_3",
        isActive: true,
      }),
    );
  });

  it("adds a new reason via the add form", async () => {
    createLossReasonAction.mockResolvedValue({
      id: "loss_4",
      label: "Preventivo troppo alto",
      isActive: true,
      sortOrder: 3,
    });
    renderPanel();

    fireEvent.change(screen.getByLabelText("Etichetta"), {
      target: { value: "Preventivo troppo alto" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi" }));

    await waitFor(() =>
      expect(createLossReasonAction).toHaveBeenCalledWith({ label: "Preventivo troppo alto" }),
    );
    expect(await screen.findByText("Preventivo troppo alto")).toBeInTheDocument();
  });

  it("shows a localized error when creation fails (e.g. duplicate label)", async () => {
    createLossReasonAction.mockRejectedValue(new Error("lossReasons.errors.duplicateLabel"));
    renderPanel();

    fireEvent.change(screen.getByLabelText("Etichetta"), {
      target: { value: "Budget insufficiente" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi" }));

    expect(
      await screen.findByText("Esiste già un motivo di perdita con questa etichetta."),
    ).toBeInTheDocument();
  });

  it("has no axe violations", async () => {
    const { container } = renderPanel();
    expect(await axe(container)).toHaveNoViolations();
  });
});
