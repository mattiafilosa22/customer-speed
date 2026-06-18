import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";

import { Input } from "@/components/ui/input";

describe("Input", () => {
  it("associates the label with the control", () => {
    render(<Input label="Email" />);
    // getByLabelText only resolves when the label is correctly associated.
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
  });

  it("links the error via aria-describedby and marks aria-invalid", () => {
    render(<Input label="Email" error="Campo obbligatorio" />);
    const field = screen.getByLabelText("Email");
    expect(field).toHaveAttribute("aria-invalid", "true");
    const describedBy = field.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    expect(screen.getByText("Campo obbligatorio")).toHaveAttribute(
      "id",
      describedBy ?? "",
    );
  });

  it("has no aria-describedby/invalid when valid", () => {
    render(<Input label="Email" />);
    const field = screen.getByLabelText("Email");
    expect(field).not.toHaveAttribute("aria-invalid");
    expect(field).not.toHaveAttribute("aria-describedby");
  });

  it("has no axe violations", async () => {
    const { container } = render(<Input label="Email" error="Errore" />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
