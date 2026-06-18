import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";

import { Pill } from "@/components/ui/pill";

describe("Pill", () => {
  it("renders a semantic tone pill", () => {
    render(<Pill tone="ok">Vinta</Pill>);
    expect(screen.getByText("Vinta")).toHaveClass("bg-ok-soft", "text-ok");
  });

  it("renders a stage pill with token-driven inline style", () => {
    render(<Pill stage="taken">Preso in carico</Pill>);
    const pill = screen.getByText("Preso in carico");
    expect(pill).toHaveStyle({ color: "var(--stage-taken)" });
  });

  it("has no axe violations", async () => {
    const { container } = render(<Pill tone="warn">Attenzione</Pill>);
    expect(await axe(container)).toHaveNoViolations();
  });
});
