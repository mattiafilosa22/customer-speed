// Same as prisma.config.ts: the CLI-invoked scripts read DATABASE_URL from .env.
import "dotenv/config";
import { hash } from "@node-rs/argon2";

import { createClient } from "../prisma/seed-helpers";

/**
 * Reset a LOCAL dev user's password (Argon2id, same parameters as the app).
 *
 * Why this exists: the seed's `upsertUser` deliberately does NOT touch
 * `passwordHash` on an existing row (re-seeding must never silently rotate a
 * credential), so a dev DB seeded long ago keeps its original password with no
 * way to recover it — the hash is one-way.
 *
 * Usage:
 *   pnpm tsx scripts/reset-local-password.ts <email> [password]
 * The password defaults to the documented dev default for Fabio.
 *
 * SAFETY: refuses to run in production and refuses any non-local DATABASE_URL —
 * this is a development convenience, never an ops tool.
 */

const ARGON2ID = 2;
const DEFAULT_PASSWORD = "ChangeMe!Fabio123";

async function main(): Promise<void> {
  const [email, password = DEFAULT_PASSWORD] = process.argv.slice(2);
  if (!email) {
    throw new Error("Usage: pnpm tsx scripts/reset-local-password.ts <email> [password]");
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to run with NODE_ENV=production.");
  }
  const url = process.env.DATABASE_URL ?? "";
  if (!/@(localhost|127\.0\.0\.1)[:/]/u.test(url)) {
    throw new Error("Refusing to run: DATABASE_URL does not point at a local database.");
  }

  const prisma = createClient();
  try {
    const user = await prisma.user.findFirst({
      where: { email: email.toLowerCase() },
      select: { id: true, email: true, organization: { select: { slug: true } } },
    });
    if (!user) {
      throw new Error(`No user with email ${email}`);
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hash(password, { algorithm: ARGON2ID }) },
    });

    console.info(`Password reset for ${user.email} (tenant "${user.organization.slug}").`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
