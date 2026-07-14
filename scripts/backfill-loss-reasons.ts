/**
 * One-off PRODUCTION repair: backfill the default `LossReason` rows for an
 * EXISTING tenant that is missing them (e.g. provisioned before
 * `DEFAULT_LOSS_REASONS` existed, or created outside `db:provision`/the demo
 * seed). Without at least one `LossReason`, moving a lead to LOST is
 * impossible end-to-end — the pipeline dialog requires selecting one from a
 * list that would otherwise be empty (see `LossReasonDialog`).
 *
 * Deliberately narrower than `db:provision` / `upsertTenant`: touches ONLY
 * `LossReason`, and only by ADDING missing default rows — it never updates an
 * existing one (so a tenant that already customized/renamed a default reason
 * is left untouched) and never touches Organization/User/LeadSource/
 * PipelineStageConfig (unlike `db:provision`, which also resets the owner's
 * password on every run and overwrites theme/appName/featureFlags — not
 * appropriate for a "just backfill the missing reasons" repair). Fails loudly
 * if `ORG_SLUG` doesn't match an existing organization — never creates one.
 *
 *   DATABASE_URL  (required)  production connection string
 *   ORG_SLUG      (required)  slug of the EXISTING tenant to repair
 *
 * Example:
 *    DATABASE_URL="$PROD_DB_URL" ORG_SLUG=fabio pnpm tsx scripts/backfill-loss-reasons.ts
 */
import { createClient, DEFAULT_LOSS_REASONS } from "../prisma/seed-helpers";

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.length === 0) {
    throw new Error(`${name} must be set.`);
  }
  return value;
}

async function main(): Promise<void> {
  const orgSlug = required("ORG_SLUG").trim().toLowerCase();

  const prisma = createClient();
  try {
    const org = await prisma.organization.findUnique({
      where: { slug: orgSlug },
      select: { id: true, name: true },
    });
    if (!org) {
      throw new Error(`No organization with slug "${orgSlug}" — refusing to create one.`);
    }

    const existing = await prisma.lossReason.findMany({
      where: { organizationId: org.id },
      select: { label: true },
    });
    const existingLabels = new Set(existing.map((r) => r.label));
    const missing = DEFAULT_LOSS_REASONS.filter((label) => !existingLabels.has(label));

    if (missing.length === 0) {
      console.info(`"${org.name}" already has all default loss reasons — nothing to do.`);
      return;
    }

    await prisma.lossReason.createMany({
      data: missing.map((label) => ({ organizationId: org.id, label })),
    });

    console.info(
      `Created ${missing.length} missing loss reason(s) for "${org.name}": ${missing.join(", ")}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error("Backfill failed:", error);
  process.exitCode = 1;
});
