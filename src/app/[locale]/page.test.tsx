import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import itMessages from "../../../messages/it.json";
import HomePage from "@/app/[locale]/page";

// The home page is an async Server Component using `next-intl/server`. In the
// jsdom unit environment there is no request scope, so stub the server APIs:
// `setRequestLocale` is a no-op and `getTranslations` resolves keys against the
// IT catalogue (mirrors the real lookup without needing the request config).
vi.mock("next-intl/server", () => ({
  setRequestLocale: vi.fn(),
  // Only the flat `home` namespace is exercised by this page.
  getTranslations: async () => {
    const table = itMessages.home as Record<string, string>;
    return (key: string) => table[key] ?? key;
  },
}));

describe("HomePage", () => {
  it("renders the localized heading and subtitle (IT)", async () => {
    render(await HomePage({ params: Promise.resolve({ locale: "it" }) }));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      itMessages.home.title,
    );
    expect(screen.getByText(itMessages.home.subtitle)).toBeInTheDocument();
  });
});
