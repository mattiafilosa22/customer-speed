import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  OverflowTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * Sample menu mirroring the lead-detail overflow usage (P0.1/P0.2): a submenu
 * for export + a destructive item. Used by every test below.
 */
function SampleMenu({ onErase }: { onErase?: () => void } = {}) {
  return (
    <DropdownMenu>
      <OverflowTrigger label="Altre azioni" />
      <DropdownMenuContent>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Esporta dati</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem>Excel (.xlsx)</DropdownMenuItem>
            <DropdownMenuItem>JSON</DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="danger" onSelect={onErase}>
          Cancella dati
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

describe("DropdownMenu", () => {
  it("renders an accessible trigger with aria-haspopup=menu and a label", () => {
    render(<SampleMenu />);
    const trigger = screen.getByRole("button", { name: "Altre azioni" });
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("opens the menu via the keyboard and exposes the items as menuitems", () => {
    render(<SampleMenu />);
    const trigger = screen.getByRole("button", { name: "Altre azioni" });
    // Radix opens on Enter/Space/ArrowDown — the keyboard path (WCAG 2.1.1).
    fireEvent.keyDown(trigger, { key: "Enter" });

    expect(screen.getByRole("menu")).toBeInTheDocument();
    // The submenu trigger + the destructive item are reachable menu rows.
    expect(screen.getByRole("menuitem", { name: /esporta dati/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /cancella dati/i })).toBeInTheDocument();
  });

  it("invokes the destructive item on selection", () => {
    const onErase = vi.fn();
    render(<SampleMenu onErase={onErase} />);
    const trigger = screen.getByRole("button", { name: "Altre azioni" });
    fireEvent.keyDown(trigger, { key: "Enter" });
    fireEvent.click(screen.getByRole("menuitem", { name: /cancella dati/i }));
    expect(onErase).toHaveBeenCalledTimes(1);
  });

  it("has no axe violations (closed trigger)", async () => {
    const { container } = render(<SampleMenu />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
