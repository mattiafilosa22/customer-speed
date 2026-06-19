import { describe, expect, it, vi } from "vitest";

import HomePage from "@/app/[locale]/page";

// The home page forwards to the app. We stub the localized `redirect` with a spy
// so we can assert the destination without a Next request scope.
const redirect = vi.fn();
vi.mock("@/i18n/navigation", () => ({
  redirect: (...args: unknown[]) => redirect(...args),
}));

describe("HomePage", () => {
  it("redirects the index to /dashboard for the requested locale", async () => {
    await HomePage({ params: Promise.resolve({ locale: "it" }) });
    expect(redirect).toHaveBeenCalledWith({ href: "/dashboard", locale: "it" });
  });
});
