import { describe, expect, it, vi } from "vitest";

import { CalendarProviderType } from "@/generated/prisma/enums";
import { getValidAccessToken } from "@/server/calendar/access-token";
import type { CalendarConnectionStore, DecryptedConnection } from "@/server/calendar/connection-store";
import type { CalendarProvider, OAuthTokens } from "@/server/calendar/provider";

const NOW = new Date("2026-06-20T12:00:00Z");

function connection(overrides: Partial<DecryptedConnection> = {}): DecryptedConnection {
  return {
    id: "conn_1",
    organizationId: "org_a",
    userId: "user_a",
    provider: CalendarProviderType.GOOGLE,
    accessToken: "CURRENT-ACCESS",
    refreshToken: "REFRESH-1",
    expiresAt: new Date(NOW.getTime() + 3600_000),
    scope: null,
    providerAccountId: null,
    ...overrides,
  };
}

function providerWithRefresh(refreshed: OAuthTokens): CalendarProvider {
  return {
    type: CalendarProviderType.GOOGLE,
    getAuthUrl: () => "",
    exchangeCode: () => Promise.resolve(refreshed),
    refreshTokens: vi.fn(() => Promise.resolve(refreshed)),
  };
}

function fakeStore(): CalendarConnectionStore {
  return {
    save: vi.fn(),
    getForUser: vi.fn(),
    getByProviderAccount: vi.fn(),
    updateTokens: vi.fn(() => Promise.resolve()),
    remove: vi.fn(),
  };
}

describe("getValidAccessToken", () => {
  it("returns the current token when it is comfortably valid", async () => {
    const provider = providerWithRefresh({ accessToken: "SHOULD-NOT-BE-USED" });
    const store = fakeStore();

    const token = await getValidAccessToken(provider, store, connection(), NOW);

    expect(token).toBe("CURRENT-ACCESS");
    expect(provider.refreshTokens).not.toHaveBeenCalled();
    expect(store.updateTokens).not.toHaveBeenCalled();
  });

  it("refreshes + persists when the token is expired", async () => {
    const refreshed: OAuthTokens = {
      accessToken: "FRESH-ACCESS",
      refreshToken: "REFRESH-2",
      expiresAt: new Date(NOW.getTime() + 3600_000),
    };
    const provider = providerWithRefresh(refreshed);
    const store = fakeStore();

    const expired = connection({ expiresAt: new Date(NOW.getTime() - 1000) });
    const token = await getValidAccessToken(provider, store, expired, NOW);

    expect(token).toBe("FRESH-ACCESS");
    expect(provider.refreshTokens).toHaveBeenCalledWith("REFRESH-1");
    expect(store.updateTokens).toHaveBeenCalledWith("conn_1", refreshed);
  });

  it("refreshes when within the expiry skew window", async () => {
    const provider = providerWithRefresh({ accessToken: "FRESH" });
    const store = fakeStore();
    // 30s left — inside the 60s skew → refresh.
    const soon = connection({ expiresAt: new Date(NOW.getTime() + 30_000) });

    const token = await getValidAccessToken(provider, store, soon, NOW);
    expect(token).toBe("FRESH");
    expect(provider.refreshTokens).toHaveBeenCalled();
  });

  it("returns the existing token when no refresh is possible", async () => {
    const provider: CalendarProvider = {
      type: CalendarProviderType.GOOGLE,
      getAuthUrl: () => "",
      exchangeCode: () => Promise.resolve({ accessToken: "" }),
      // no refreshTokens
    };
    const store = fakeStore();
    const expired = connection({ expiresAt: new Date(NOW.getTime() - 1000), refreshToken: null });

    const token = await getValidAccessToken(provider, store, expired, NOW);
    expect(token).toBe("CURRENT-ACCESS");
    expect(store.updateTokens).not.toHaveBeenCalled();
  });
});
