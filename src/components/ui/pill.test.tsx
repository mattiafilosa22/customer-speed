import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";

import { Pill } from "@/components/ui/pill";

describe("Pill", () => {
  it("renders a semantic tone pill with token-driven, AA-darkened inline style", () => {
    render(<Pill tone="ok">Vinta</Pill>);
    const pill = screen.getByText("Vinta");
    // Text is the hue darkened toward black by --pill-ink-darken (AA on the soft
    // tint); background is a soft tint of the same token. Both derived from --ok.
    expect(pill).toHaveStyle({
      color: "color-mix(in srgb, var(--ok), black var(--pill-ink-darken))",
      backgroundColor: "color-mix(in srgb, var(--ok) 12%, var(--panel))",
    });
  });

  it("renders a stage pill with token-driven, AA-darkened inline style", () => {
    render(<Pill stage="taken">Preso in carico</Pill>);
    const pill = screen.getByText("Preso in carico");
    expect(pill).toHaveStyle({
      color: "color-mix(in srgb, var(--stage-taken), black var(--pill-ink-darken))",
      backgroundColor: "color-mix(in srgb, var(--stage-taken) 12%, var(--panel))",
    });
  });

  it("has no axe violations", async () => {
    const { container } = render(<Pill tone="warn">Attenzione</Pill>);
    expect(await axe(container)).toHaveNoViolations();
  });
});
