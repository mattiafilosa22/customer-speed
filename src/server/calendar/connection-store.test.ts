import { describe, expect, it } from "vitest";

import { CalendarProviderType } from "@/generated/prisma/enums";
import { createTokenCipher } from "@/lib/crypto";
import { createConnectionStore, type ConnectionPrisma } from "@/server/calendar/connection-store";
import { FakeTenantDb } from "@/server/calendar/test-helpers";

const KEY = Buffer.alloc(32, 5).toString("base64");
const ORG_A = "org_a";
const ORG_B = "org_b";
const USER_A = "user_a";

function storeFor(db: FakeTenantDb, organizationId: string) {
  const cipher = createTokenCipher(KEY);
  // The fake tenant surface stamps organizationId on create like the real client.
  const tenantPrisma = db.tenant(organizationId) as unknown as ConnectionPrisma;
  return { store: createConnectionStore(tenantPrisma, cipher), cipher };
}

describe("CalendarConnectionStore", () => {
  it("encrypts tokens at rest and decrypts them on read (round-trip)", async () => {
    const db = new FakeTenantDb();
    const { store } = storeFor(db, ORG_A);

    await store.save({
      userId: USER_A,
      provider: CalendarProviderType.GOOGLE,
      tokens: {
        accessToken: "PLAINTEXT-ACCESS",
        refreshToken: "PLAINTEXT-REFRESH",
        expiresAt: new Date("2026-06-20T10:00:00Z"),
        scope: "calendar.events",
      },
      providerAccountId: "sub-1",
    });

    // Stored value is NOT the plaintext.
    const raw = db.connections[0]!;
    expect(raw.accessToken).not.toBe("PLAINTEXT-ACCESS");
    expect(raw.accessToken.startsWith("v1.")).toBe(true);
    expect(raw.refreshToken).not.toBe("PLAINTEXT-REFRESH");

    // Read decrypts back to plaintext.
    const loaded = await store.getForUser(USER_A, CalendarProviderType.GOOGLE);
    expect(loaded?.accessToken).toBe("PLAINTEXT-ACCESS");
    expect(loaded?.refreshToken).toBe("PLAINTEXT-REFRESH");
    expect(loaded?.providerAccountId).toBe("sub-1");
  });

  it("getByProviderAccount finds the OWNING connection (used for secure webhook mapping)", async () => {
    const db = new FakeTenantDb();
    const { store, cipher } = storeFor(db, ORG_A);
    db.addConnection({
      organizationId: ORG_A,
      userId: USER_A,
      provider: CalendarProviderType.CALENDLY,
      accessToken: cipher.encrypt("A"),
      refreshToken: null,
      expiresAt: null,
      scope: null,
      providerAccountId: "calendly-user-1",
    });

    const found = await store.getByProviderAccount(
      CalendarProviderType.CALENDLY,
      "calendly-user-1",
    );
    expect(found?.organizationId).toBe(ORG_A);
    const missing = await store.getByProviderAccount(
      CalendarProviderType.CALENDLY,
      "unknown",
    );
    expect(missing).toBeNull();
  });

  it("does NOT expose another tenant's connection through the tenant client", async () => {
    const db = new FakeTenantDb();
    const { cipher } = storeFor(db, ORG_A);
    db.addConnection({
      organizationId: ORG_B,
      userId: "user_b",
      provider: CalendarProviderType.GOOGLE,
      accessToken: cipher.encrypt("B"),
      refreshToken: null,
      expiresAt: null,
      scope: null,
      providerAccountId: null,
    });

    // Store scoped to ORG_A must not see ORG_B's connection for user_b.
    const { store } = storeFor(db, ORG_A);
    const loaded = await store.getForUser("user_b", CalendarProviderType.GOOGLE);
    expect(loaded).toBeNull();
  });

  it("updateTokens keeps the existing refresh token when the new one is absent", async () => {
    const db = new FakeTenantDb();
    const { store } = storeFor(db, ORG_A);
    await store.save({
      userId: USER_A,
      provider: CalendarProviderType.GOOGLE,
      tokens: { accessToken: "A1", refreshToken: "R1", expiresAt: null, scope: null },
    });
    const connId = db.connections[0]!.id;

    await store.updateTokens(connId, { accessToken: "A2", expiresAt: null });

    const loaded = await store.getForUser(USER_A, CalendarProviderType.GOOGLE);
    expect(loaded?.accessToken).toBe("A2");
    expect(loaded?.refreshToken).toBe("R1"); // preserved
  });

  it("remove is idempotent (deleting a missing connection is a no-op)", async () => {
    const db = new FakeTenantDb();
    const { store } = storeFor(db, ORG_A);
    await expect(
      store.remove(USER_A, CalendarProviderType.GOOGLE),
    ).resolves.toBeUndefined();
  });
});
