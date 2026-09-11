import { beforeEach, describe, expect, it, vi } from "vitest";

const { findUnique } = vi.hoisted(() => ({ findUnique: vi.fn() }));

vi.mock("@/lib/prisma", () => ({ prisma: { organization: { findUnique } } }));

import { getShellBranding } from "@/server/organization/get-shell-branding";

describe("getShellBranding", () => {
  beforeEach(() => findUnique.mockReset());

  it("returns the linked Insight source label in the existing shell query", async () => {
    findUnique.mockResolvedValue({
      appName: "CRM Finanza",
      theme: {},
      markFallback: null,
      poweredBy: true,
      insightSource: { label: "Instagram" },
    });

    const branding = await getShellBranding("org-a", "CustomerSpeed");

    expect(branding.insightSourceLabel).toBe("Instagram");
    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({ insightSource: { select: { label: true } } }),
      }),
    );
  });
});
