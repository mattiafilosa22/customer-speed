import { describe, expect, it, vi } from "vitest";

import { NotFoundError } from "@/lib/errors";
import { resolveOrganizationIdBySlug } from "@/server/tenant/resolve-organization";
import type { PrismaClient } from "@/generated/prisma/client";

function prismaWith(org: { id: string } | null): PrismaClient {
  return {
    organization: { findUnique: vi.fn(async () => org) },
  } as unknown as PrismaClient;
}

describe("resolveOrganizationIdBySlug", () => {
  it("returns the id for a known slug (normalized)", async () => {
    const prisma = prismaWith({ id: "org_1" });
    const id = await resolveOrganizationIdBySlug(prisma, "  Fabio  ");
    expect(id).toBe("org_1");
    expect(prisma.organization.findUnique).toHaveBeenCalledWith({
      where: { slug: "fabio" },
      select: { id: true },
    });
  });

  // Unknown/empty slug → NotFoundError so the auth actions surface a VISIBLE
  // form-level error. A ValidationError would key onto the hidden
  // `organizationSlug` field and the form would fail silently ("nothing happens").
  it("throws NotFoundError for an unknown slug", async () => {
    const prisma = prismaWith(null);
    await expect(resolveOrganizationIdBySlug(prisma, "ghost")).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("throws NotFoundError for an empty slug without hitting the DB", async () => {
    const prisma = prismaWith({ id: "org_1" });
    await expect(resolveOrganizationIdBySlug(prisma, "   ")).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(prisma.organization.findUnique).not.toHaveBeenCalled();
  });
});
