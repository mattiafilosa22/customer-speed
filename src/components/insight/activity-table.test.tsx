import type { ReactNode } from "react";
import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";

import itMessages from "../../../messages/it.json";
import { day, view } from "@/components/insight/test-fixtures";

vi.mock("@/app/[locale]/(app)/insight/actions", () => ({
  saveActivityDayAction: vi.fn(),
  listCellLeadsAction: vi.fn().mockResolvedValue([]),
  createLeadFromCellAction: vi.fn(),
}));
vi.mock("@/i18n/navigation", () => ({ Link: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a> }));

import { ActivityTable } from "@/components/insight/activity-table";

function renderIntl(node: ReactNode) {
  return render(<NextIntlClientProvider locale="it" messages={itMessages}>{node}</NextIntlClientProvider>);
}

describe("ActivityTable", () => {
  it("renders semantic rows, editable live counters and interactive derived cells", () => {
    const row = day("2026-09-07", { welcome: { ...day("x").welcome, sent: 67 } });
    renderIntl(<ActivityTable view={view([row])} canEdit sourceLabel="Instagram" />);

    expect(screen.getAllByRole("row")).toHaveLength(5);
    const dataRow = screen.getByRole("row", { name: /07/ });
    expect(within(dataRow).getByRole("spinbutton", { name: /welcome inviati/i })).toHaveValue(67);
    expect(within(dataRow).getByRole("button", { name: /appuntamenti welcome/i })).toHaveTextContent("–");
  });

  it("makes archived days explicitly read-only", () => {
    renderIntl(<ActivityTable view={view([day("2026-09-02", { isArchived: true })])} canEdit />);
    const row = screen.getByRole("row", { name: /02/ });
    expect(within(row).queryByRole("spinbutton")).toBeNull();
    expect(within(row).queryByRole("button")).toBeNull();
    expect(within(row).getAllByText(/archivio/i).length).toBeGreaterThan(0);
  });

  it("disables future manual cells and keeps non-editors read-only", () => {
    const { rerender } = renderIntl(<ActivityTable view={view([day("2026-09-30", { isFuture: true })])} canEdit />);
    expect(screen.getByRole("spinbutton", { name: /welcome inviati/i })).toBeDisabled();
    rerender(<NextIntlClientProvider locale="it" messages={itMessages}><ActivityTable view={view([day("2026-09-07")])} canEdit={false} /></NextIntlClientProvider>);
    expect(screen.queryByRole("spinbutton")).toBeNull();
    expect(screen.getByRole("button", { name: /appuntamenti welcome/i })).toBeInTheDocument();
  });

  it("renders totals, rates and the mixed-period notice", () => {
    const row = day("2026-09-01", { welcome: { ...day("x").welcome, sent: 100, replies: 10 } });
    renderIntl(<ActivityTable view={view([day("2026-08-31", { isArchived: true }), row])} canEdit />);
    expect(screen.getByRole("row", { name: /totale mese/i })).toHaveTextContent("100");
    expect(screen.getByRole("row", { name: /conversione/i })).toHaveTextContent("10,0%");
    expect(screen.getByText(/archivio e dato vivo/i)).toBeInTheDocument();
  });

  it("has no accessibility violations", async () => {
    const { container } = renderIntl(<ActivityTable view={view([day("2026-09-07")])} canEdit />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
