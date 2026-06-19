import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";

import { Card, CardBody } from "@/components/ui/card";

describe("Card", () => {
  it("renders content inside the surface", () => {
    render(
      <Card>
        <CardBody>contenuto</CardBody>
      </Card>,
    );
    expect(screen.getByText("contenuto")).toBeInTheDocument();
  });

  it("applies the themed surface classes", () => {
    const { container } = render(<Card>x</Card>);
    expect(container.firstElementChild).toHaveClass("bg-panel", "shadow-sm");
  });

  it("has no axe violations", async () => {
    const { container } = render(
      <Card>
        <CardBody>contenuto</CardBody>
      </Card>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
