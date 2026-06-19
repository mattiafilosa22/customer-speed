import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";

import { Slider } from "@/components/ui/slider";

describe("Slider", () => {
  it("renders a labelled range with min/max/value", () => {
    render(
      <Slider label="Stondatura" value={12} min={0} max={22} unit="px" onValueChange={() => {}} />,
    );
    const slider = screen.getByRole("slider", { name: "Stondatura" });
    expect(slider).toHaveAttribute("min", "0");
    expect(slider).toHaveAttribute("max", "22");
    expect(slider).toHaveValue("12");
    expect(slider).toHaveAttribute("aria-valuetext", "12px");
  });

  it("reports the numeric value on change", () => {
    const onChange = vi.fn();
    render(<Slider label="R" value={0} min={0} max={22} onValueChange={onChange} />);
    fireEvent.change(screen.getByRole("slider", { name: "R" }), { target: { value: "10" } });
    expect(onChange).toHaveBeenCalledWith(10);
  });

  it("has no axe violations", async () => {
    const { container } = render(
      <Slider label="Raggio" value={8} min={0} max={22} unit="px" onValueChange={() => {}} />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
