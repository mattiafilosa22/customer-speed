import "dotenv/config";
import { defineConfig, env } from "prisma/config";

/**
 * Prisma 7 configuration.
 *
 * In Prisma 7 the connection URL is no longer declared in `schema.prisma`.
 * The Prisma CLI / Migrate read it from here; the runtime client uses a driver
 * adapter (see `src/lib/prisma.ts`).
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
