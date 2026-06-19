import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";

import itMessages from "../../../messages/it.json";
import { SidebarNav } from "@/components/layout/sidebar-nav";

// Mock the locale-aware navigation module: `usePathname` returns a stable
// prefix-less path (as the real wrapper does) and `Link` renders a plain <a>.
// We avoid importActual because next-intl's createNavigation pulls in
// `next/navigation` in a way the jsdom resolver can't load.
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

describe("SidebarNav", () => {
  it("marks the active route with aria-current=page", () => {
    renderWithIntl(<SidebarNav />);
    const active = screen.getByRole("link", { name: /Lead/ });
    expect(active).toHaveAttribute("aria-current", "page");
  });

  it("does not mark inactive routes", () => {
    renderWithIntl(<SidebarNav />);
    expect(screen.getByRole("link", { name: /Dashboard/ })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("renders all five navigation entries with localized labels", () => {
    renderWithIntl(<SidebarNav />);
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(5);
    // Labels resolve from the `nav` IT namespace, not hard-coded.
    expect(screen.getByRole("link", { name: /Appuntamenti/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Impostazioni/ })).toBeInTheDocument();
  });

  it("has no axe violations", async () => {
    const { container } = renderWithIntl(
      <nav aria-label={itMessages.nav.ariaLabel}>
        <SidebarNav />
      </nav>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
