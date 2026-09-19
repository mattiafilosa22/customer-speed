import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import itMessages from "../../../messages/it.json";
import { NewLeadDialog } from "@/components/leads/new-lead-dialog";

vi.mock("@/app/[locale]/(app)/leads/actions", () => ({
  createLeadAction: vi.fn(async () => ({ status: "idle" })),
}));

const sources = [
  { id: "instagram", label: "Instagram" },
  { id: "referral", label: "Referenza" },
];

function renderDialog() {
  return render(
    <NextIntlClientProvider locale="it" messages={itMessages}>
      <NewLeadDialog sources={sources} insightSourceId="instagram" />
    </NextIntlClientProvider>,
  );
}

describe("NewLeadDialog chat channel", () => {
  it("shows the channel only for the source linked to Insight & Stats", () => {
    renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Nuovo lead" }));

    const source = screen.getByRole("combobox", { name: "Provenienza" });
    expect(screen.queryByRole("combobox", { name: "Canale" })).toBeNull();

    fireEvent.change(source, { target: { value: "instagram" } });
    expect(screen.getByRole("combobox", { name: "Canale" })).toBeRequired();

    fireEvent.change(source, { target: { value: "referral" } });
    expect(screen.queryByRole("combobox", { name: "Canale" })).toBeNull();
  });
});
