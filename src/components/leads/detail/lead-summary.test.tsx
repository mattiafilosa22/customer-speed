import { render, screen } from "@testing-library/react";
import { createFormatter, createTranslator } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import itMessages from "../../../../messages/it.json";
import { formats } from "@/i18n/formats";
import { CapitalBracket, LeadStage } from "@/generated/prisma/enums";

// The "Sintesi" strip is an async Server Component built on next-intl/server.
// We back those server helpers with the SAME real IT messages + named formats
// the app uses, via next-intl's framework-agnostic `createTranslator` /
// `createFormatter`, so the test asserts the genuine localized output (stage
// label, EUR figure, bracket label) — not a stub.
const TEST_LOCALE = "it";
const TIME_ZONE = "Europe/Rome";

vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace?: string) =>
    // `createTranslator` types `namespace` against the message tree; the runtime
    // accepts any dotted path, so we widen it here for the test stub only.
    createTranslator({
      locale: TEST_LOCALE,
      messages: itMessages,
      namespace: namespace as never,
    }),
  getFormatter: async () =>
    createFormatter({ locale: TEST_LOCALE, formats, timeZone: TIME_ZONE }),
}));

import { LeadSummary } from "@/components/leads/detail/lead-summary";

type SummaryProps = Parameters<typeof LeadSummary>[0];

async function renderSummary(props: Partial<SummaryProps> = {}) {
  const ui = await LeadSummary({
    stage: LeadStage.TAKEN,
    daysInStage: 3,
    capitalBracket: null,
    capitalAmount: null,
    source: null,
    createdAt: "18 giu 2026",
    ...props,
  });
  return render(ui);
}

describe("LeadSummary", () => {
  it("renders the stage label with days-in-stage as one fact", async () => {
    await renderSummary({ stage: LeadStage.TAKEN, daysInStage: 3 });
    // IT stage label for TAKEN + "3 giorni nello stage".
    expect(screen.getByText(/preso in carico/i)).toBeInTheDocument();
    expect(screen.getByText(/3 giorni nello stage/i)).toBeInTheDocument();
  });

  it("shows the exact € figure when an amount is set (not the bracket)", async () => {
    await renderSummary({
      capitalAmount: 175_000,
      capitalBracket: CapitalBracket.B_100_250K,
    });
    // EUR locale formatting for IT, exact figure.
    expect(screen.getByText(/175\.000/)).toBeInTheDocument();
  });

  it("falls back to the bracket label when only a bracket is set", async () => {
    await renderSummary({ capitalAmount: null, capitalBracket: CapitalBracket.B_50_100K });
    const bracketLabel = itMessages.enum.capitalBracket.B_50_100K;
    expect(screen.getByText(bracketLabel)).toBeInTheDocument();
  });

  it("renders the source label when present", async () => {
    await renderSummary({ source: { id: "src_1", label: "Funnel" } });
    expect(screen.getByText("Funnel")).toBeInTheDocument();
  });

  it("renders an em-dash for a missing source", async () => {
    const { container } = await renderSummary({ source: null });
    // The source fact value is the em-dash placeholder.
    const sourceTerm = screen.getByText(itMessages.leadDetail.summary.source);
    const value = sourceTerm.parentElement?.querySelector("dd");
    expect(value?.textContent).toBe("—");
    expect(container).toBeTruthy();
  });

  it("renders the created-on date and is read-only (no form controls)", async () => {
    await renderSummary({ createdAt: "18 giu 2026" });
    expect(screen.getByText("18 giu 2026")).toBeInTheDocument();
    // The summary never embeds editors (capital/source live in "Dettagli lead").
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
