import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";
import { vi } from "vitest";

import itMessages from "../../../messages/it.json";
import { LeadTabs } from "@/components/leads/lead-tabs";
import { LeadStage } from "@/generated/prisma/enums";
import type { LeadListResult } from "@/server/leads";

// Same pattern as `date-range-filter.test.tsx`: `next/navigation` and the
// locale-aware `@/i18n/navigation` are mocked separately so the component can
// render outside a real App Router tree, with `Link` reduced to a plain `<a>`
// (next-intl's `createNavigation` doesn't resolve in jsdom).
let currentSearch = "";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(currentSearch),
}));

vi.mock("@/i18n/navigation", () => ({
  usePathname: () => "/leads",
  Link: ({
    href,
    children,
    ...props
  }: { href: string; children: ReactNode } & Record<string, unknown>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

function renderWithIntl(ui: ReactNode) {
  return render(
    <NextIntlClientProvider locale="it" messages={itMessages}>
      {ui}
    </NextIntlClientProvider>,
  );
}

/** Minimal `stageCounts` fixture: "all" plus whatever stages are passed in. */
function stageCounts(
  counts: Partial<Record<LeadStage, number>>,
): LeadListResult["stageCounts"] {
  const all = Object.values(counts).reduce((sum, n) => sum + (n ?? 0), 0);
  return { all, ...counts };
}

describe("LeadTabs", () => {
  it("renders a clickable card for every stage that has leads, in canonical pipeline order", () => {
    currentSearch = "";
    renderWithIntl(
      <LeadTabs
        stageCounts={stageCounts({
          [LeadStage.TO_HANDLE]: 3,
          [LeadStage.TAKEN]: 1,
          [LeadStage.WON]: 2,
        })}
      />,
    );

    const tabs = screen.getAllByRole("tab").map((el) => el.textContent);
    // "Tutti (n)" first, then only the stages with a non-zero count, in
    // pipeline order (TO_HANDLE → TAKEN → ... → WON), never alphabetical.
    expect(tabs).toEqual([
      "Tutti (6)",
      "Da gestire(3)",
      "Telefonata fissata(1)",
      "Vinta(2)",
    ]);
  });

  it("renders a filterable tab for a lead in the 'Seconda call' stage (PRESENTATION_CALL_2)", () => {
    currentSearch = "";
    renderWithIntl(
      <LeadTabs stageCounts={stageCounts({ [LeadStage.PRESENTATION_CALL_2]: 1 })} />,
    );

    const tab = screen.getByRole("tab", { name: /Seconda call/ });
    expect(tab).toHaveAttribute("href", "/leads?stage=PRESENTATION_CALL_2");
  });

  it("renders a filterable tab for a lead in the 'Stand by' stage (STANDBY)", () => {
    currentSearch = "";
    renderWithIntl(<LeadTabs stageCounts={stageCounts({ [LeadStage.STANDBY]: 1 })} />);

    const tab = screen.getByRole("tab", { name: /Stand by/ });
    expect(tab).toHaveAttribute("href", "/leads?stage=STANDBY");
  });

  it("places 'Seconda call' after 'Call presentazione' and 'Stand by' after 'Attesa decisione' (canonical order)", () => {
    currentSearch = "";
    renderWithIntl(
      <LeadTabs
        stageCounts={stageCounts({
          [LeadStage.PRESENTATION_CALL]: 1,
          [LeadStage.PRESENTATION_CALL_2]: 1,
          [LeadStage.WAITING_DECISION]: 1,
          [LeadStage.STANDBY]: 1,
        })}
      />,
    );

    const labels = screen
      .getAllByRole("tab")
      .slice(1) // drop "Tutti (n)"
      .map((el) => el.textContent ?? "");
    const presentationIdx = labels.findIndex((t) => t.startsWith("Call presentazione"));
    const secondCallIdx = labels.findIndex((t) => t.startsWith("Seconda call"));
    const waitingDecisionIdx = labels.findIndex((t) => t.startsWith("Attesa decisione"));
    const standbyIdx = labels.findIndex((t) => t.startsWith("Stand by"));

    expect(presentationIdx).toBeGreaterThanOrEqual(0);
    expect(secondCallIdx).toBeGreaterThan(presentationIdx);
    expect(waitingDecisionIdx).toBeGreaterThanOrEqual(0);
    expect(standbyIdx).toBeGreaterThan(waitingDecisionIdx);
  });

  it("marks the tab matching the current ?stage= as the active tab (aria-current)", () => {
    currentSearch = "stage=STANDBY";
    renderWithIntl(<LeadTabs stageCounts={stageCounts({ [LeadStage.STANDBY]: 4 })} />);

    expect(screen.getByRole("tab", { name: /Stand by/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("has no axe violations", async () => {
    currentSearch = "";
    const { container } = renderWithIntl(
      <LeadTabs
        stageCounts={stageCounts({
          [LeadStage.TO_HANDLE]: 1,
          [LeadStage.PRESENTATION_CALL_2]: 1,
          [LeadStage.STANDBY]: 1,
        })}
      />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
