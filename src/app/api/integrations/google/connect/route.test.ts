import { afterEach, describe, expect, it, vi } from "vitest";

import { NotFoundError, UnauthorizedError } from "@/lib/errors";
import { ForbiddenError } from "@/lib/rbac";

/**
 * Route-handler tests for GET /api/integrations/google/connect. Mocks the guard
 * (auth → RBAC → flag) and the provider config/factory. Covers: not configured →
 * 503, flag off → 404, no auth → 401, denied → 403, happy → 302 to Google.
 */

const requireCalendarContext = vi.fn();
const isProviderConfigured = vi.fn();
const getProvider = vi.fn();
const cookieSet = vi.fn();

vi.mock("@/server/calendar/route-guard", () => ({
  requireCalendarContext: (...a: unknown[]) => requireCalendarContext(...a),
}));
vi.mock("@/server/calendar/config", () => ({
  isProviderConfigured: (...a: unknown[]) => isProviderConfigured(...a),
}));
vi.mock("@/server/calendar/registry", () => ({
  getProvider: (...a: unknown[]) => getProvider(...a),
}));
vi.mock("next/headers", () => ({
  cookies: () => Promise.resolve({ set: cookieSet }),
}));

import { GET } from "@/app/api/integrations/google/connect/route";

afterEach(() => vi.clearAllMocks());

describe("GET /api/integrations/google/connect", () => {
  it("redirects (302) to the Google consent URL and sets the state cookie", async () => {
    requireCalendarContext.mockResolvedValue({ organizationId: "org_a", userId: "u", role: "proUser" });
    isProviderConfigured.mockReturnValue(true);
    getProvider.mockReturnValue({
      getAuthUrl: ({ state }: { state: string }) => `https://accounts.google.com/o/oauth2/v2/auth?state=${state}`,
    });

    const res = await GET();

    expect(res.status).toBe(307); // NextResponse.redirect default
    expect(res.headers.get("location")).toContain("accounts.google.com");
    expect(cookieSet).toHaveBeenCalledTimes(1);
    const [name, value, opts] = cookieSet.mock.calls[0]!;
    expect(name).toContain("oauth_state");
    expect(value).toBeTruthy();
    expect(opts).toMatchObject({ httpOnly: true, sameSite: "lax" });
  });

  it("returns 503 when Google is not configured (graceful degradation)", async () => {
    requireCalendarContext.mockResolvedValue({ organizationId: "org_a", userId: "u", role: "proUser" });
    isProviderConfigured.mockReturnValue(false);

    const res = await GET();
    expect(res.status).toBe(503);
    expect(cookieSet).not.toHaveBeenCalled();
  });

  it("returns 404 when the tenant flag is OFF (guard throws NotFound)", async () => {
    requireCalendarContext.mockRejectedValue(new NotFoundError());
    const res = await GET();
    expect(res.status).toBe(404);
  });

  it("returns 401 when unauthenticated", async () => {
    requireCalendarContext.mockRejectedValue(new UnauthorizedError());
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 403 when the role lacks calendar.integrations", async () => {
    requireCalendarContext.mockRejectedValue(new ForbiddenError("calendar.integrations"));
    const res = await GET();
    expect(res.status).toBe(403);
  });
});
