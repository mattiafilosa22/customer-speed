import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";

import { Button } from "@/components/ui/button";

describe("Button", () => {
  it("renders its children with type=button by default", () => {
    render(<Button>Salva</Button>);
    const btn = screen.getByRole("button", { name: "Salva" });
    expect(btn).toHaveAttribute("type", "button");
  });

  it("applies squared style by removing the radius", () => {
    render(<Button squared>Squadrato</Button>);
    expect(screen.getByRole("button", { name: "Squadrato" })).toHaveClass(
      "rounded-none",
    );
  });

  it("supports the ghost variant", () => {
    render(<Button variant="ghost">Ghost</Button>);
    expect(screen.getByRole("button", { name: "Ghost" })).toHaveClass("border");
  });

  it("has no axe violations", async () => {
    const { container } = render(<Button>Accessibile</Button>);
    expect(await axe(container)).toHaveNoViolations();
  });
});
