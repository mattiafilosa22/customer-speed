import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tests for `saveCookieConsentAction` proof-of-consent tenant coherence.
 *
 * SECURITY INVARIANT (security review, ALTA): a `Consent` row's `organizationId`
 * MUST belong to the same tenant as its `userId`. Pinning the consent to a fixed
 * default tenant while taking `userId` from the session would mix tenants for an
 * authenticated user whose tenant is not the default (e.g. a superAdmin in the
 * platform tenant, or any user on a customer tenant).
 *
 *  - AUTHENTICATED  → organizationId = the user's OWN tenant; userId = the user.
 *  - ANONYMOUS      → organizationId = the neutral platform tenant; userId = null.
 */

const cookieStore = { set: vi.fn() };
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => cookieStore) }));

interface ConsentRow {
  organizationId: string;
  userId: string | null;
}
const createMany = vi.fn(async (_args: { data: ConsentRow[] }) => ({ count: 2 }));
const orgFindUnique = vi.fn(async (_args: unknown) => ({ id: "org_platform" }) as { id: string } | null);
vi.mock("@/lib/prisma", () => ({
  prisma: {
    consent: { createMany: (args: { data: ConsentRow[] }) => createMany(args) },
    organization: { findUnique: (args: unknown) => orgFindUnique(args) },
  },
}));

const getSessionUser = vi.fn();
vi.mock("@/server/auth/guards", () => ({
  getSessionUser: () => getSessionUser(),
}));

vi.mock("@/server/actions/request-meta", () => ({
  getRequestMeta: vi.fn(async () => ({ ip: "1.2.3.4", userAgent: "vitest" })),
}));

import { saveCookieConsentAction } from "@/app/cookie-actions";

function consentRows(): { data: ConsentRow[] } | undefined {
  return createMany.mock.calls[0]?.[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  orgFindUnique.mockResolvedValue({ id: "org_platform" });
});

describe("saveCookieConsentAction", () => {
  it("pins consent to the AUTHENTICATED user's own tenant (not the default)", async () => {
    getSessionUser.mockResolvedValue({ id: "user_1", organizationId: "org_customer" });

    await saveCookieConsentAction(true);

    const rows = consentRows()?.data ?? [];
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.organizationId).toBe("org_customer");
      expect(row.userId).toBe("user_1");
    }
    // The platform tenant lookup must NOT be used when a session exists.
    expect(orgFindUnique).not.toHaveBeenCalled();
  });

  it("uses the neutral PLATFORM tenant with userId=null for an anonymous visitor", async () => {
    getSessionUser.mockResolvedValue(null);

    await saveCookieConsentAction(false);

    const rows = consentRows()?.data ?? [];
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.organizationId).toBe("org_platform");
      expect(row.userId).toBeNull();
    }
    expect(orgFindUnique).toHaveBeenCalledOnce();
  });

  it("always sets the client mirror cookie even if the audit write fails", async () => {
    getSessionUser.mockResolvedValue(null);
    createMany.mockRejectedValueOnce(new Error("db down"));

    await expect(saveCookieConsentAction(true)).resolves.toBeUndefined();
    expect(cookieStore.set).toHaveBeenCalledOnce();
  });
});
