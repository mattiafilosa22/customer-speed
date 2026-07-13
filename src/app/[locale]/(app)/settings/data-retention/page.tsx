import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { can } from "@/lib/rbac";
import { requireTenantContext } from "@/lib/tenant";
import { buildExportDeps, countRetentionCandidates } from "@/server/privacy";
import { DataRetentionPanel } from "@/components/settings/data-retention-panel";

/**
 * "Pulizia lead persi" (data retention) settings page (docs/09, Fase 8).
 *
 * Gated by the `settings.tenant` capability (proUser / superAdmin — NOT
 * baseUser, docs/02 §2.1), mirroring the "Aspetto & brand" page: a user
 * without it gets a 404 (not 403) so the route does not reveal the feature's
 * existence, and every Server Action re-checks server-side regardless
 * (defense in depth). Loads the tenant's current retention window + a preview
 * count as the initial state for the client panel.
 */
export default async function DataRetentionPage() {
  const t = await getTranslations("dataRetention");

  const ctx = await requireTenantContext();
  if (!can(ctx.role, "settings.tenant")) {
    notFound();
  }

  // Read-only preview: reuses the same tenant-scoped deps builder as the
  // per-lead GDPR export (no PII leaves this page — count only).
  const deps = buildExportDeps(ctx);
  const preview = await countRetentionCandidates(deps);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-ink text-3xl">{t("title")}</h1>
        <p className="font-body text-muted max-w-2xl text-[14px]">{t("description")}</p>
      </div>

      <DataRetentionPanel
        initialRetentionMonths={preview.retentionMonths}
        initialCount={preview.count}
      />
    </div>
  );
}
