/**
 * One-off PRODUCTION provisioning: create (or repair) a real tenant + its owner
 * user, WITHOUT any demo data (no example leads / appointments / invoices).
 *
 * Use this to make a fresh production database usable when the deploy applied
 * migrations (`prisma migrate deploy`) but never ran the demo seed. It reuses the
 * EXACT structural config from `prisma/seed-helpers.ts` (theme, feature flags,
 * default lead sources, loss reasons, pipeline stage configs) so the tenant is
 * fully functional, then upserts the owner with a hashed password.
 *
 * Idempotent: re-running updates the org config and RESETS the owner password to
 * the supplied value (unlike the demo seed's `upsertUser`, which never touches an
 * existing password). Safe to run more than once.
 *
 * Everything sensitive is read from the environment — nothing is hardcoded:
 *
 *   DATABASE_URL    (required)  production connection string
 *   OWNER_PASSWORD  (required)  owner login password (policy: >=10 chars, >=1 letter, >=1 digit)
 *   ORG_SLUG        (default "fabio")
 *   ORG_NAME        (default "Fabio Consulting")
 *   ORG_APP_NAME    (default "CustomerSpeed")
 *   OWNER_EMAIL     (default "fabio@fabio.local")
 *   OWNER_NAME      (default "Fabio")
 *
 * Example (password kept OUT of shell history with a leading space):
 *    DATABASE_URL="$PROD_DB_URL" OWNER_PASSWORD='…' pnpm tsx scripts/provision-tenant-owner.ts
 */
import { hash } from "@node-rs/argon2";

import { Role } from "../src/generated/prisma/enums";
import { ARGON2ID, FEATURE_FLAGS, createClient, upsertTenant } from "../prisma/seed-helpers";

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.length === 0) {
    throw new Error(`${name} must be set.`);
  }
  return value;
}

/** Mirrors the auth password policy (src/server/auth/schemas.ts). */
function assertPasswordPolicy(password: string): void {
  const ok = password.length >= 10 && /[A-Za-z]/.test(password) && /[0-9]/.test(password);
  if (!ok) {
    throw new Error(
      "OWNER_PASSWORD does not meet the policy: at least 10 characters, including a letter and a digit.",
    );
  }
}

async function main(): Promise<void> {
  const password = required("OWNER_PASSWORD");
  assertPasswordPolicy(password);

  const orgSlug = (process.env.ORG_SLUG ?? "fabio").trim().toLowerCase();
  const orgName = process.env.ORG_NAME ?? "Fabio Consulting";
  const appName = process.env.ORG_APP_NAME ?? "CustomerSpeed";
  const ownerEmail = (process.env.OWNER_EMAIL ?? "fabio@fabio.local").trim().toLowerCase();
  const ownerName = process.env.OWNER_NAME ?? "Fabio";

  const prisma = createClient();
  try {
    const passwordHash = await hash(password, { algorithm: ARGON2ID });

    // 1) Tenant + structural config (calendar integrations OFF, as for Fabio).
    const org = await upsertTenant(prisma, {
      name: orgName,
      slug: orgSlug,
      appName,
      featureFlags: { ...FEATURE_FLAGS, calendarIntegrations: false },
    });

    // 2) Owner user. Unlike the demo seed, the password IS (re)set on update so a
    //    re-run repairs/rotates the credentials. Email pre-verified + active so
    //    the account can log in immediately.
    const user = await prisma.user.upsert({
      where: { organizationId_email: { organizationId: org.id, email: ownerEmail } },
      update: { name: ownerName, role: Role.proUser, isActive: true, passwordHash },
      create: {
        organizationId: org.id,
        email: ownerEmail,
        name: ownerName,
        role: Role.proUser,
        passwordHash,
        emailVerified: new Date(),
        isActive: true,
      },
      select: { id: true },
    });

    console.info(
      `Provisioned tenant "${orgSlug}" (org ${org.id}) + owner ${ownerEmail} ` +
        `(user ${user.id}, role proUser). Login at /login?org=${orgSlug}. ` +
        `Password was set from OWNER_PASSWORD — change it after first login.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error("Provisioning failed:", error);
  process.exitCode = 1;
});
