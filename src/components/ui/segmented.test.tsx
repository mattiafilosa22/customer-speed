import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";

import { Segmented } from "@/components/ui/segmented";

const OPTIONS = [
  { value: "light", label: "Chiara" },
  { value: "dark", label: "Scura" },
  { value: "auto", label: "Auto" },
] as const;

describe("Segmented", () => {
  it("is a radiogroup with the selected option checked", () => {
    render(
      <Segmented label="Modalità" options={OPTIONS} value="light" onValueChange={() => {}} />,
    );
    expect(screen.getByRole("radiogroup", { name: "Modalità" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Chiara" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Scura" })).not.toBeChecked();
  });

  it("reports the new value when an option is chosen", () => {
    const onChange = vi.fn();
    render(<Segmented label="Modalità" options={OPTIONS} value="light" onValueChange={onChange} />);

    fireEvent.click(screen.getByRole("radio", { name: "Scura" }));
    expect(onChange).toHaveBeenCalledWith("dark");
  });

  it("has no axe violations", async () => {
    const { container } = render(
      <Segmented label="Modalità" options={OPTIONS} value="auto" onValueChange={() => {}} />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
