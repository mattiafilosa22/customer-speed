import { createRef } from "react";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";

import itMessages from "../../../messages/it.json";
import { formats } from "@/i18n/formats";
import { RecaptchaV2Challenge } from "@/components/auth/recaptcha-v2-challenge";

function renderChallenge() {
  const ref = createRef<HTMLDivElement>();
  const utils = render(
    <NextIntlClientProvider locale="it" messages={itMessages} formats={formats} timeZone="Europe/Rome">
      <RecaptchaV2Challenge containerRef={ref} />
    </NextIntlClientProvider>,
  );
  return { ref, ...utils };
}

describe("RecaptchaV2Challenge", () => {
  it("announces the challenge via an assertive live region with the localized message", () => {
    renderChallenge();
    const alert = screen.getByRole("alert");
    expect(alert).toHaveAttribute("aria-live", "assertive");
    expect(alert).toHaveTextContent("Completa la verifica di sicurezza qui sotto per continuare.");
  });

  it("exposes a labelled group and moves focus to it on mount", () => {
    renderChallenge();
    const group = screen.getByRole("group", {
      name: 'Verifica di sicurezza "Non sono un robot"',
    });
    expect(group).toBe(document.activeElement);
  });

  it("has no accessibility violations", async () => {
    const { container } = renderChallenge();
    expect(await axe(container)).toHaveNoViolations();
  });
});
