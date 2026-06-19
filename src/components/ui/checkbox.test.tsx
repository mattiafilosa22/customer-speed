import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";

import { Checkbox } from "@/components/ui/checkbox";

describe("Checkbox", () => {
  it("associates the label with the control", () => {
    render(<Checkbox label="Accetto" />);
    expect(screen.getByLabelText("Accetto")).toBeInTheDocument();
  });

  it("links the error via aria-describedby and marks aria-invalid", () => {
    render(<Checkbox label="Accetto" error="Obbligatorio" />);
    const field = screen.getByLabelText("Accetto");
    expect(field).toHaveAttribute("aria-invalid", "true");
    const describedBy = field.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    expect(screen.getByText("Obbligatorio")).toHaveAttribute("id", describedBy ?? "");
  });

  it("has no aria-describedby/invalid when valid", () => {
    render(<Checkbox label="Accetto" />);
    const field = screen.getByLabelText("Accetto");
    expect(field).not.toHaveAttribute("aria-invalid");
    expect(field).not.toHaveAttribute("aria-describedby");
  });

  it("has no axe violations", async () => {
    const { container } = render(<Checkbox label="Accetto" error="Errore" />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
