import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { NotFoundError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { requireSuperAdminContext } from "@/lib/tenant";
import { createAuditLogger } from "@/server/audit/audit-log";
import {
  buildAdminDeps,
  buildOrganizationDepsForTarget,
  getOrganization,
  listUsers,
} from "@/server/admin";
import { getOrganizationBranding } from "@/server/organization";
import { LinkButton } from "@/components/admin/link-button";
import { AdminAppearancePanel } from "@/components/admin/admin-appearance-panel";
import { FeatureFlagsForm } from "@/components/admin/feature-flags-form";
import { TenantSettingsForm } from "@/components/admin/tenant-settings-form";
import { TenantUsers } from "@/components/admin/tenant-users";

/**
 * Tenant configuration page (docs/04 §4.10, docs/08 Fase 7) — the single place a
 * superAdmin configures a tenant: identity settings, feature flags, the REUSED
 * white-label theme/brand panel, and per-tenant user management. superAdmin only;
 * re-checks `admin.tenants` server-side.
 *
 * Loads everything via the audited admin/white-label use cases (BASE client,
 * cross-tenant). A missing/invalid id → 404.
 */
export default async function TenantDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const t = await getTranslations("admin.detail");

  const ctx = await requireSuperAdminContext();
  requirePermission(ctx.role, "admin.tenants");

  const { id } = await params;
  const adminDeps = buildAdminDeps(ctx);

  let detail;
  let users;
  let branding;
  try {
    [detail, users] = await Promise.all([
      getOrganization(adminDeps, { organizationId: id }),
      listUsers(adminDeps, { organizationId: id, page: 1, pageSize: 100 }),
    ]);
    // Reuse the tenant white-label read for the target org (one source of truth).
    branding = await getOrganizationBranding(buildOrganizationDepsForTarget(ctx, id));
  } catch (error) {
    if (error instanceof NotFoundError) {
      notFound();
    }
    throw error;
  }

  // Cross-tenant read of a specific tenant's full configuration is traceable.
  await createAuditLogger(prisma).record({
    action: "admin.organization.view",
    actorId: ctx.userId,
    organizationId: detail.id,
    entity: "Organization",
    entityId: detail.id,
  });

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-3xl text-ink">{detail.name}</h1>
          <p className="font-mono text-[13px] text-muted">{detail.slug}</p>
        </div>
        <LinkButton href="/admin/tenants" variant="ghost" size="sm">
          {t("back")}
        </LinkButton>
      </div>

      <section aria-labelledby="settings-heading">
        <h2 id="settings-heading" className="sr-only">
          {t("sections.settings")}
        </h2>
        <TenantSettingsForm
          organizationId={detail.id}
          initial={{
            name: detail.name,
            appName: detail.appName,
            slug: detail.slug,
            customDomain: detail.customDomain,
          }}
        />
      </section>

      <section aria-labelledby="flags-heading">
        <h2 id="flags-heading" className="sr-only">
          {t("sections.flags")}
        </h2>
        <FeatureFlagsForm organizationId={detail.id} initial={detail.featureFlags} />
      </section>

      <section aria-labelledby="users-heading">
        <h2 id="users-heading" className="sr-only">
          {t("sections.users")}
        </h2>
        <TenantUsers organizationId={detail.id} users={users.items} />
      </section>

      <section aria-labelledby="appearance-heading">
        <h2 id="appearance-heading" className="mb-4 font-display text-2xl text-ink">
          {t("sections.appearance")}
        </h2>
        <AdminAppearancePanel organizationId={detail.id} initial={branding} />
      </section>
    </div>
  );
}
