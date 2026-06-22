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
  // Cap the pg pool size per instance: on serverless each warm instance keeps its
  // own pool, so the default (max 10) times a few instances quickly exhausts a
  // low-cap database pooler (Supabase session-mode = 15 clients) → "max clients
  // reached" 500s. `DATABASE_POOL_MAX` keeps the per-instance footprint small.
  const adapter = new PrismaPg({
    connectionString: env.DATABASE_URL,
    max: env.DATABASE_POOL_MAX,
  });
  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma: PrismaClient = globalForPrisma.prisma ?? createPrismaClient();

if (env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
