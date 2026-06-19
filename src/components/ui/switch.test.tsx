import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";

import { Switch } from "@/components/ui/switch";

describe("Switch", () => {
  it("exposes role=switch with aria-checked reflecting state", () => {
    render(<Switch label="Ombre" checked onCheckedChange={() => {}} />);
    const sw = screen.getByRole("switch", { name: "Ombre" });
    expect(sw).toHaveAttribute("aria-checked", "true");
  });

  it("toggles on activation and reports the new value", () => {
    const onChange = vi.fn();
    render(<Switch label="Powered by" checked={false} onCheckedChange={onChange} />);

    fireEvent.click(screen.getByRole("switch", { name: "Powered by" }));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("has no axe violations", async () => {
    const { container } = render(
      <Switch label="Accessibile" checked onCheckedChange={() => {}} description="aiuto" />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
