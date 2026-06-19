import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";

import itMessages from "../../../../messages/it.json";
import { formats } from "@/i18n/formats";
import { CapitalBracket } from "@/generated/prisma/enums";

const setCapitalAction = vi.fn(async () => ({ status: "idle" as const }));

vi.mock("@/app/[locale]/(app)/leads/actions", () => ({
  setCapitalAction: (...a: unknown[]) => setCapitalAction(...(a as [])),
}));

import { CapitalSelect } from "@/components/leads/detail/capital-select";

function renderEditor(props: Partial<Parameters<typeof CapitalSelect>[0]> = {}) {
  return render(
    <NextIntlClientProvider
      locale="it"
      messages={itMessages}
      formats={formats}
      timeZone="Europe/Rome"
    >
      <CapitalSelect
        leadId="lead_1"
        capitalBracket={null}
        capitalAmount={null}
        canSetCapital
        {...props}
      />
    </NextIntlClientProvider>,
  );
}

afterEach(() => vi.clearAllMocks());

describe("CapitalSelect", () => {
  it("starts in bracket mode by default and shows the bracket Select", () => {
    renderEditor();
    expect(screen.getByRole("radio", { name: "Fascia" })).toBeChecked();
    expect(screen.getByRole("combobox")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("switches to exact-amount mode showing a numeric input", () => {
    renderEditor();
    fireEvent.click(screen.getByRole("radio", { name: "Importo esatto" }));

    const amount = screen.getByLabelText("Importo esatto (€)");
    expect(amount).toBeInTheDocument();
    expect(amount).toHaveAttribute("inputmode", "decimal");
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("starts in exact-amount mode when the lead already has an amount", () => {
    renderEditor({ capitalAmount: 175_000, capitalBracket: CapitalBracket.B_100_250K });
    expect(screen.getByRole("radio", { name: "Importo esatto" })).toBeChecked();
    expect(screen.getByLabelText("Importo esatto (€)")).toHaveValue("175000");
  });

  it("renders read-only display (the cifra) when the user cannot set capital", () => {
    renderEditor({ canSetCapital: false, capitalAmount: 175_000 });
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
    // EUR formatting for the IT locale, exact figure shown.
    expect(screen.getByText(/175\.000/)).toBeInTheDocument();
  });

  it("has no critical accessibility violations in amount mode", async () => {
    const { container } = renderEditor();
    fireEvent.click(screen.getByRole("radio", { name: "Importo esatto" }));
    expect(await axe(container)).toHaveNoViolations();
  });
});
