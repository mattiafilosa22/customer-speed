import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";

import itMessages from "../../../../messages/it.json";
import { type ActionState } from "@/server/actions/action-result";

const updateLeadAction = vi.fn(
  async (_prev: unknown, _form: FormData): Promise<ActionState> => ({
    status: "idle",
  }),
);

vi.mock("@/app/[locale]/(app)/leads/actions", () => ({
  updateLeadAction: (...a: unknown[]) =>
    updateLeadAction(...(a as Parameters<typeof updateLeadAction>)),
}));

import { EditLeadDialog } from "@/components/leads/detail/edit-lead-dialog";

function renderDialog() {
  return render(
    <NextIntlClientProvider locale="it" messages={itMessages}>
      <EditLeadDialog
        leadId="lead_1"
        firstName="Mario"
        lastName="Rossi"
        email="mario.rossi@example.com"
        phone="+39 333 1234567"
      />
    </NextIntlClientProvider>,
  );
}

function openDialog() {
  fireEvent.click(screen.getByRole("button", { name: "Modifica" }));
}

afterEach(() => vi.clearAllMocks());

describe("EditLeadDialog", () => {
  it("precompiles the form with the lead's current contact fields", () => {
    renderDialog();
    openDialog();

    expect(screen.getByLabelText("Nome")).toHaveValue("Mario");
    expect(screen.getByLabelText("Cognome")).toHaveValue("Rossi");
    expect(screen.getByLabelText("Email")).toHaveValue("mario.rossi@example.com");
    expect(screen.getByLabelText("Telefono")).toHaveValue("+39 333 1234567");
  });

  it("submits updateLeadAction with the edited values, including the leadId", async () => {
    renderDialog();
    openDialog();

    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Luigi" } });
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "luigi.rossi@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salva" }));

    await waitFor(() => expect(updateLeadAction).toHaveBeenCalledTimes(1));
    const submitted = updateLeadAction.mock.calls[0]?.[1] as FormData;
    expect(submitted.get("leadId")).toBe("lead_1");
    expect(submitted.get("firstName")).toBe("Luigi");
    expect(submitted.get("lastName")).toBe("Rossi");
    expect(submitted.get("email")).toBe("luigi.rossi@example.com");
    expect(submitted.get("phone")).toBe("+39 333 1234567");
  });

  it("shows a FormAlert and keeps the dialog open when the server rejects the input (e.g. invalid email)", async () => {
    updateLeadAction.mockResolvedValueOnce({
      status: "error",
      fieldErrors: { email: "leads.errors.fields.email" },
    });
    renderDialog();
    openDialog();

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "not-an-email" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva" }));

    expect(await screen.findByText("Inserisci un'email valida.")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("closes on the 'Annulla' button without submitting", () => {
    renderDialog();
    openDialog();

    fireEvent.click(screen.getByRole("button", { name: "Annulla" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(updateLeadAction).not.toHaveBeenCalled();
  });

  it("returns focus to the 'Modifica' trigger button after closing", async () => {
    renderDialog();
    const trigger = screen.getByRole("button", { name: "Modifica" });
    // `fireEvent.click` (unlike a real browser click, or `userEvent.click`)
    // does not itself move focus to the target — focus it explicitly first so
    // `document.activeElement` matches what actually happens when a mouse or
    // keyboard user activates this button (mirrors data-retention-panel.test.tsx).
    trigger.focus();
    fireEvent.click(trigger);

    fireEvent.click(screen.getByRole("button", { name: "Annulla" }));

    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("has no axe violations when open", async () => {
    const { container } = renderDialog();
    openDialog();
    expect(await axe(container)).toHaveNoViolations();
  });
});
