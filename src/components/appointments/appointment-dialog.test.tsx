import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";

import itMessages from "../../../messages/it.json";

const createAppointmentAction = vi.fn(async (_prev: unknown, _form: FormData) => ({
  status: "idle" as const,
}));
const updateAppointmentAction = vi.fn(async (_prev: unknown, _form: FormData) => ({
  status: "idle" as const,
}));

vi.mock("@/app/[locale]/(app)/appointments/actions", () => ({
  createAppointmentAction: (...a: unknown[]) =>
    createAppointmentAction(...(a as Parameters<typeof createAppointmentAction>)),
  updateAppointmentAction: (...a: unknown[]) =>
    updateAppointmentAction(...(a as Parameters<typeof updateAppointmentAction>)),
}));

import { AppointmentDialog } from "@/components/appointments/appointment-dialog";

const LEADS = [{ id: "lead_1", firstName: "Mario", lastName: "Rossi" }];

function renderDialog(appointment?: { id: string; startAt: string; reason: string; leadId: string | null }) {
  return render(
    <NextIntlClientProvider locale="it" messages={itMessages}>
      <AppointmentDialog leads={LEADS} appointment={appointment} />
    </NextIntlClientProvider>,
  );
}

function openDialog() {
  fireEvent.click(screen.getByRole("button", { name: "Nuovo appuntamento" }));
}

afterEach(() => vi.clearAllMocks());

describe("AppointmentDialog", () => {
  it("renders separate date and time fields, both empty for a new appointment", () => {
    renderDialog();
    openDialog();

    expect(screen.getByLabelText("Data")).toHaveValue("");
    expect(screen.getByLabelText("Ora")).toHaveValue("");
  });

  it("moves focus to the time field once the date is fully entered", () => {
    renderDialog();
    openDialog();

    const dateInput = screen.getByLabelText("Data");
    fireEvent.change(dateInput, { target: { value: "2026-07-20" } });

    expect(screen.getByLabelText("Ora")).toHaveFocus();
  });

  it("does not steal focus while the date is still incomplete", () => {
    renderDialog();
    openDialog();

    const dateInput = screen.getByLabelText("Data");
    dateInput.focus();
    fireEvent.change(dateInput, { target: { value: "2026-07" } });

    expect(dateInput).toHaveFocus();
  });

  it("does not jump early on a still-mid-typed year (Chrome shifts year digits in one at a time)", () => {
    // Regression: Chrome's `type="date"` year sub-field is an odometer — typing
    // "2026" one digit at a time reports `.value` as "0002-07-20",
    // "0020-07-20", "0202-07-20", "2026-07-20" in turn. All four are
    // syntactically-complete 10-char strings, so a naive `length === 10` check
    // jumps focus on the FIRST digit instead of the last.
    renderDialog();
    openDialog();

    const dateInput = screen.getByLabelText("Data");
    dateInput.focus();
    for (const padded of ["0002-07-20", "0020-07-20", "0202-07-20"]) {
      fireEvent.change(dateInput, { target: { value: padded } });
      expect(dateInput).toHaveFocus();
    }

    fireEvent.change(dateInput, { target: { value: "2026-07-20" } });
    expect(screen.getByLabelText("Ora")).toHaveFocus();
  });

  it("submits the combined date + time as a single startAt field", async () => {
    renderDialog();
    openDialog();

    fireEvent.change(screen.getByLabelText("Data"), { target: { value: "2026-07-20" } });
    fireEvent.change(screen.getByLabelText("Ora"), { target: { value: "14:30" } });
    fireEvent.change(screen.getByLabelText("Motivo"), { target: { value: "Call conoscitiva" } });

    fireEvent.click(screen.getByRole("button", { name: "Salva appuntamento" }));

    await waitFor(() => expect(createAppointmentAction).toHaveBeenCalledTimes(1));
    const submitted = createAppointmentAction.mock.calls[0]?.[1] as FormData;
    expect(submitted.get("startAt")).toBe("2026-07-20T14:30");
  });

  it("pre-fills date and time from an existing appointment when editing", () => {
    // Edit mode is always driven via the controlled `open` prop in real usage
    // (see `appointment-row-actions.tsx`) — the default trigger button is not
    // rendered when `open` is provided.
    render(
      <NextIntlClientProvider locale="it" messages={itMessages}>
        <AppointmentDialog
          leads={LEADS}
          appointment={{
            id: "appt_1",
            startAt: "2026-07-20T14:30",
            reason: "Call conoscitiva",
            leadId: null,
          }}
          open
          onOpenChange={() => {}}
        />
      </NextIntlClientProvider>,
    );

    expect(screen.getByLabelText("Data")).toHaveValue("2026-07-20");
    expect(screen.getByLabelText("Ora")).toHaveValue("14:30");
  });

  it("has no axe violations", async () => {
    const { container } = renderDialog();
    openDialog();
    expect(await axe(container)).toHaveNoViolations();
  });
});
