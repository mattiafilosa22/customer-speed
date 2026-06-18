import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";

import { SidebarNav } from "@/components/layout/sidebar-nav";

// next/navigation's usePathname is the only external dependency to control.
vi.mock("next/navigation", () => ({
  usePathname: () => "/leads",
}));

describe("SidebarNav", () => {
  it("marks the active route with aria-current=page", () => {
    render(<SidebarNav />);
    const active = screen.getByRole("link", { name: /Lead/ });
    expect(active).toHaveAttribute("aria-current", "page");
  });

  it("does not mark inactive routes", () => {
    render(<SidebarNav />);
    expect(screen.getByRole("link", { name: /Dashboard/ })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("renders all five navigation entries", () => {
    render(<SidebarNav />);
    expect(screen.getAllByRole("link")).toHaveLength(5);
  });

  it("has no axe violations", async () => {
    const { container } = render(
      <nav aria-label="Navigazione principale">
        <SidebarNav />
      </nav>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
