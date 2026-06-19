import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";

import itMessages from "../../../messages/it.json";
import { INDIGO_THEME } from "@/lib/theme";
import type { OrganizationBranding } from "@/server/organization";

const updateThemeAction = vi.fn(async () => ({ ok: true as const }));
const updateBrandingAction = vi.fn(async () => ({ ok: true as const }));

vi.mock("@/app/[locale]/(app)/settings/appearance/actions", () => ({
  updateThemeAction: (...a: unknown[]) => updateThemeAction(...(a as [])),
  updateBrandingAction: (...a: unknown[]) => updateBrandingAction(...(a as [])),
}));

import { AppearancePanel } from "@/components/appearance/appearance-panel";
import { AppearanceQueryProvider } from "@/components/appearance/query-provider";

const INITIAL: OrganizationBranding = {
  appName: "CustomerSpeed",
  theme: INDIGO_THEME,
  logoUrl: null,
  faviconUrl: null,
  markFallback: "CS",
  poweredBy: true,
};

function renderPanel(initial: OrganizationBranding = INITIAL) {
  return render(
    <NextIntlClientProvider locale="it" messages={itMessages}>
      <AppearanceQueryProvider>
        <AppearancePanel initial={initial} />
      </AppearanceQueryProvider>
    </NextIntlClientProvider>,
  );
}

afterEach(() => vi.clearAllMocks());

describe("AppearancePanel", () => {
  it("renders the four sections with accessible headings", () => {
    renderPanel();
    expect(screen.getByRole("heading", { name: "Brand" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Tema & colori" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Componenti" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Anteprima live" })).toBeInTheDocument();
  });

  it("exposes the key controls (radius slider, mode radiogroup, powered-by switch)", () => {
    renderPanel();
    expect(screen.getByRole("slider", { name: /Stondatura/ })).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: "Modalità" })).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: /powered by/i })).toBeInTheDocument();
  });

  it("shows the advisory muted warning for the default theme (non-blocking)", () => {
    renderPanel();
    // Indigo default passes critical AA but --muted is the documented advisory.
    expect(screen.getByText(/Avvisi di contrasto/)).toBeInTheDocument();
    // Save is NOT blocked by the advisory warning.
    expect(screen.getByRole("button", { name: "Salva tema" })).not.toBeDisabled();
  });

  it("blocks save and shows a contrast error when accent fails AA", () => {
    renderPanel();

    // Set the primary color to a too-light value that fails white-on-accent.
    const colorInput = screen.getByLabelText("Colore primario");
    fireEvent.change(colorInput, { target: { value: "#f1c40f" } });

    const save = screen.getByRole("button", { name: "Salva tema" });
    expect(save).toBeDisabled();
    expect(screen.getByText(/Contrasto insufficiente/)).toBeInTheDocument();
    expect(updateThemeAction).not.toHaveBeenCalled();
  });

  it("saves theme + branding on Save (happy path)", async () => {
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "Salva tema" }));

    expect(await screen.findByText("Tema salvato.")).toBeInTheDocument();
    expect(updateThemeAction).toHaveBeenCalledTimes(1);
    expect(updateBrandingAction).toHaveBeenCalledTimes(1);
  });

  it("has no axe violations", async () => {
    const { container } = renderPanel();
    expect(await axe(container)).toHaveNoViolations();
  });
});
