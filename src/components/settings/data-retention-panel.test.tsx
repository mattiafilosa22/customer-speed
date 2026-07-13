import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";

import itMessages from "../../../messages/it.json";

const updateRetentionSettingsAction = vi.fn(async () => ({ ok: true as const }));
const getRetentionCandidatesCountAction = vi.fn(async () => ({
  count: 3,
  retentionMonths: 6,
}));
const exportRetentionCandidatesAction = vi.fn(async () => ({
  status: "success" as const,
  filename: "retention-export-2026-07-13.json",
  data: { exportedAt: "2026-07-13T00:00:00.000Z", count: 2, leads: [] },
  leadIds: ["lead-1", "lead-2"],
}));
const purgeRetentionCandidatesAction = vi.fn(async () => ({
  status: "success" as const,
  anonymized: 2,
  alreadyAnonymized: 0,
  failed: [],
}));

vi.mock("@/app/[locale]/(app)/settings/data-retention/actions", () => ({
  updateRetentionSettingsAction: (...a: unknown[]) =>
    updateRetentionSettingsAction(...(a as [])),
  getRetentionCandidatesCountAction: (...a: unknown[]) =>
    getRetentionCandidatesCountAction(...(a as [])),
  exportRetentionCandidatesAction: (...a: unknown[]) =>
    exportRetentionCandidatesAction(...(a as [])),
  purgeRetentionCandidatesAction: (...a: unknown[]) =>
    purgeRetentionCandidatesAction(...(a as [])),
}));

import { DataRetentionPanel } from "@/components/settings/data-retention-panel";

function renderPanel() {
  return render(
    <NextIntlClientProvider locale="it" messages={itMessages}>
      <DataRetentionPanel initialRetentionMonths={6} initialCount={3} />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  // jsdom doesn't implement the Blob download plumbing used by the "scarica
  // poi elimina" flow (`downloadBlob`): stub it so the export handler can run
  // without crashing the test environment.
  vi.stubGlobal("URL", {
    ...URL,
    createObjectURL: vi.fn(() => "blob:mock"),
    revokeObjectURL: vi.fn(),
  });
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("DataRetentionPanel", () => {
  it("renders the three sections with accessible headings", () => {
    renderPanel();
    expect(screen.getByRole("heading", { name: "Finestra di conservazione" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Anteprima" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Backup ed eliminazione definitiva" }),
    ).toBeInTheDocument();
  });

  it("keeps the purge trigger disabled until a backup is downloaded in this session", () => {
    renderPanel();
    expect(screen.getByRole("button", { name: "Elimina definitivamente" })).toBeDisabled();
  });

  it("enables the purge trigger after a successful backup download", async () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Scarica backup (JSON)" }));

    await waitFor(() => expect(exportRetentionCandidatesAction).toHaveBeenCalledTimes(1));
    await screen.findByText(/Backup di 2 lead scaricato/);
    expect(screen.getByRole("button", { name: "Elimina definitivamente" })).toBeEnabled();
  });

  it("opens the confirm dialog with focus on Annulla (not the destructive action) and returns focus on cancel", async () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Scarica backup (JSON)" }));
    await waitFor(() => expect(exportRetentionCandidatesAction).toHaveBeenCalledTimes(1));

    const purgeTrigger = await screen.findByRole("button", { name: "Elimina definitivamente" });
    // `fireEvent.click` (unlike a real browser click, or `userEvent.click`)
    // does not itself move focus to the target — focus it explicitly first so
    // `document.activeElement` matches what actually happens when a mouse or
    // keyboard user activates this button.
    purgeTrigger.focus();
    fireEvent.click(purgeTrigger);

    const cancelButton = await screen.findByRole("button", { name: "Annulla" });
    await waitFor(() => expect(cancelButton).toHaveFocus());

    const confirmButton = screen.getByRole("button", { name: "Conferma eliminazione" });
    expect(confirmButton).not.toHaveFocus();

    fireEvent.click(cancelButton);
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    await waitFor(() => expect(purgeTrigger).toHaveFocus());
  });

  it("purges after explicit confirmation and shows the result summary", async () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Scarica backup (JSON)" }));
    await waitFor(() => expect(exportRetentionCandidatesAction).toHaveBeenCalledTimes(1));
    fireEvent.click(await screen.findByRole("button", { name: "Elimina definitivamente" }));

    fireEvent.click(await screen.findByRole("button", { name: "Conferma eliminazione" }));

    expect(await screen.findByText(/2 anonimizzati/)).toBeInTheDocument();
    expect(purgeRetentionCandidatesAction).toHaveBeenCalledWith(["lead-1", "lead-2"]);
    // The guardrail resets after a successful purge — the trigger disables again.
    expect(screen.getByRole("button", { name: "Elimina definitivamente" })).toBeDisabled();
  });

  it("has no axe violations", async () => {
    const { container } = renderPanel();
    expect(await axe(container)).toHaveNoViolations();
  });
});
