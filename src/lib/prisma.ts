import { PrismaPg } from "@prisma/adapter-pg";

import { env } from "@/lib/env";
import { PrismaClient } from "@/generated/prisma/client";

/**
 * Base PrismaClient singleton.
 *
 * Layering: infrastructure (`lib/`). Domain/service code must NOT import this
 * directly for tenant-scoped reads/writes — it should go through the
 * tenant-aware client (see `src/lib/prisma-tenant.ts`), which forces the
 * `organizationId` filter. This base client exists for:
 *   - bootstrapping (migrations/seed, auth lookups by global unique keys),
 *   - the explicit, audited `superAdmin` cross-tenant context.
 *
 * Prisma 7 uses a driver adapter for the connection (no `url` in schema).
 * The `globalThis` cache prevents exhausting DB connections under Next.js HMR
 * in development.
 */

function createPrismaClient(): PrismaClient {
  const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma: PrismaClient = globalForPrisma.prisma ?? createPrismaClient();

if (env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
