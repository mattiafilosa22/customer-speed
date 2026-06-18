import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tests for the layout-level session guard. Verifies the guard returns null
 * (→ the layout redirects) for every invalid case and re-validates the JWT
 * against the DB (existence, active, sessionVersion) rather than trusting the
 * token. Auth + Prisma are mocked.
 */

const auth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => auth() }));

const findUnique = vi.fn();
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique: (a: unknown) => findUnique(a) } } }));

import { getSessionUser } from "@/server/auth/guards";

const sessionUser = { id: "u1", organizationId: "org_1", role: "proUser", sessionVersion: 3 };
const dbUser = {
  id: "u1",
  organizationId: "org_1",
  role: "proUser",
  name: "Mario",
  email: "mario@example.com",
  isActive: true,
  sessionVersion: 3,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getSessionUser", () => {
  it("returns null when there is no session", async () => {
    auth.mockResolvedValue(null);
    expect(await getSessionUser()).toBeNull();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("returns null when the user no longer exists", async () => {
    auth.mockResolvedValue({ user: sessionUser });
    findUnique.mockResolvedValue(null);
    expect(await getSessionUser()).toBeNull();
  });

  it("returns null when the user is inactive", async () => {
    auth.mockResolvedValue({ user: sessionUser });
    findUnique.mockResolvedValue({ ...dbUser, isActive: false });
    expect(await getSessionUser()).toBeNull();
  });

  it("returns null when the session version is stale (invalidated)", async () => {
    auth.mockResolvedValue({ user: { ...sessionUser, sessionVersion: 2 } });
    findUnique.mockResolvedValue(dbUser);
    expect(await getSessionUser()).toBeNull();
  });

  it("returns the validated user on a fresh, active session", async () => {
    auth.mockResolvedValue({ user: sessionUser });
    findUnique.mockResolvedValue(dbUser);
    expect(await getSessionUser()).toEqual({
      id: "u1",
      organizationId: "org_1",
      role: "proUser",
      name: "Mario",
      email: "mario@example.com",
    });
  });
});
