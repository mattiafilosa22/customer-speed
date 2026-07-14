import type { ReactNode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";

import itMessages from "../../../messages/it.json";
import { DateRangeFilter } from "@/components/dashboard/date-range-filter";

// The component reads the query string via `next/navigation`'s useSearchParams
// and writes it via the locale-aware `@/i18n/navigation` router/pathname (same
// pattern as `period-filter.tsx`). Both are mocked so the component can render
// outside a real Next.js App Router tree; `replace` is asserted against.
let currentSearch = "";
const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(currentSearch),
}));

vi.mock("@/i18n/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({ replace }),
}));

function renderWithIntl(ui: ReactNode) {
  return render(
    <NextIntlClientProvider locale="it" messages={itMessages}>
      {ui}
    </NextIntlClientProvider>,
  );
}

/** The URL passed to the most recent `router.replace` call (asserts it happened). */
function lastReplacedUrl(): string {
  const call = replace.mock.calls.at(-1);
  if (!call) throw new Error("router.replace was not called");
  return call[0] as string;
}

describe("DateRangeFilter", () => {
  it("clicking 'Ultima settimana' sets preset=lastWeek and clears from/to", () => {
    currentSearch = "from=2026-01-01&to=2026-01-05";
    replace.mockClear();
    renderWithIntl(<DateRangeFilter />);

    fireEvent.click(screen.getByRole("button", { name: "Ultima settimana" }));

    expect(replace).toHaveBeenCalledTimes(1);
    const url = lastReplacedUrl();
    const params = new URL(url, "http://localhost").searchParams;
    expect(params.get("preset")).toBe("lastWeek");
    expect(params.has("from")).toBe(false);
    expect(params.has("to")).toBe(false);
  });

  it("typing a 'from' date updates the URL with the new from param", () => {
    currentSearch = "";
    replace.mockClear();
    renderWithIntl(<DateRangeFilter />);

    fireEvent.change(screen.getByLabelText("Dal"), { target: { value: "2026-07-01" } });

    expect(replace).toHaveBeenCalledTimes(1);
    const url = lastReplacedUrl();
    const params = new URL(url, "http://localhost").searchParams;
    expect(params.get("from")).toBe("2026-07-01");
  });

  it("typing a 'to' date updates the URL with the new to param", () => {
    currentSearch = "from=2026-07-01";
    replace.mockClear();
    renderWithIntl(<DateRangeFilter />);

    fireEvent.change(screen.getByLabelText("Al"), { target: { value: "2026-07-10" } });

    expect(replace).toHaveBeenCalledTimes(1);
    const url = lastReplacedUrl();
    const params = new URL(url, "http://localhost").searchParams;
    expect(params.get("to")).toBe("2026-07-10");
    expect(params.get("from")).toBe("2026-07-01");
  });

  it("clicking 'Tutto' removes from/to/preset", () => {
    currentSearch = "from=2026-07-01&to=2026-07-10&preset=lastWeek&year=2026";
    replace.mockClear();
    renderWithIntl(<DateRangeFilter />);

    fireEvent.click(screen.getByRole("button", { name: "Tutto" }));

    expect(replace).toHaveBeenCalledTimes(1);
    const url = lastReplacedUrl();
    const params = new URL(url, "http://localhost").searchParams;
    expect(params.has("from")).toBe(false);
    expect(params.has("to")).toBe(false);
    expect(params.has("preset")).toBe(false);
    // The unrelated year/month param is left untouched (shared with PeriodFilter).
    expect(params.get("year")).toBe("2026");
  });

  it("shows the active-range notice only when from/to/preset are present", () => {
    currentSearch = "";
    renderWithIntl(<DateRangeFilter />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows the active-range notice when preset is present", () => {
    currentSearch = "preset=lastWeek";
    renderWithIntl(<DateRangeFilter />);
    expect(screen.getByRole("status")).toHaveTextContent("Filtro per intervallo attivo");
  });

  it("does NOT show the active-range notice when only 'from' is filled (no 'to' yet)", () => {
    currentSearch = "from=2026-07-01";
    renderWithIntl(<DateRangeFilter />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("does NOT show the active-range notice when only 'to' is filled (no 'from' yet)", () => {
    currentSearch = "to=2026-07-10";
    renderWithIntl(<DateRangeFilter />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows an inline error and no active-range notice when 'from' is after 'to'", () => {
    currentSearch = "from=2026-07-10&to=2026-07-01";
    renderWithIntl(<DateRangeFilter />);

    expect(
      screen.getByText('La data "Al" deve essere uguale o successiva alla data "Dal"'),
    ).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("does not show the inverted-range error for a valid, non-inverted range", () => {
    currentSearch = "from=2026-07-01&to=2026-07-10";
    renderWithIntl(<DateRangeFilter />);

    expect(
      screen.queryByText('La data "Al" deve essere uguale o successiva alla data "Dal"'),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Filtro per intervallo attivo");
  });

  it("has no axe violations", async () => {
    currentSearch = "";
    const { container } = renderWithIntl(<DateRangeFilter />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
