import type { ReactNode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import itMessages from "../../../messages/it.json";
import { day } from "@/components/insight/test-fixtures";
import { ManualCell } from "@/components/insight/manual-cell";
import { saveActivityDayAction } from "@/app/[locale]/(app)/insight/actions";

vi.mock("@/app/[locale]/(app)/insight/actions", () => ({
  saveActivityDayAction: vi.fn(),
}));

function renderIntl(node: ReactNode) {
  return render(
    <NextIntlClientProvider locale="it" messages={itMessages}>
      {node}
    </NextIntlClientProvider>,
  );
}

const mockedSave = vi.mocked(saveActivityDayAction);

describe("ManualCell", () => {
  it("renders a plain value, not an input, when the row is not editable", () => {
    renderIntl(
      <ManualCell
        row={day("2026-09-05")}
        field="welcomeSent"
        label="Welcome inviati"
        editable={false}
      />,
    );
    expect(screen.queryByRole("spinbutton")).toBeNull();
  });

  it("saves on blur and clears any previous error", async () => {
    mockedSave.mockResolvedValueOnce({ status: "success" });
    renderIntl(
      <ManualCell row={day("2026-09-05")} field="welcomeSent" label="Welcome inviati" editable />,
    );

    const input = screen.getByRole("spinbutton", { name: /welcome inviati/i });
    fireEvent.change(input, { target: { value: "12" } });
    fireEvent.blur(input);

    await waitFor(() => expect(mockedSave).toHaveBeenCalled());
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("announces a save error, associated with the field via aria-describedby", async () => {
    mockedSave.mockResolvedValueOnce({
      status: "error",
      fieldErrors: { welcomeSent: "insight.errors.repliesExceedWelcome" },
    });
    renderIntl(
      <ManualCell row={day("2026-09-05")} field="welcomeSent" label="Welcome inviati" editable />,
    );

    const input = screen.getByRole("spinbutton", { name: /welcome inviati/i });
    fireEvent.change(input, { target: { value: "5" } });
    fireEvent.blur(input);

    const alert = await screen.findByRole("alert");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input.getAttribute("aria-describedby")).toBe(alert.id);
  });
});
