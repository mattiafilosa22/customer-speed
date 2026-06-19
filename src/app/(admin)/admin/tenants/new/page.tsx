import { getTranslations } from "next-intl/server";

import { requirePermission } from "@/lib/rbac";
import { requireSuperAdminContext } from "@/lib/tenant";
import { CreateTenantForm } from "@/components/admin/create-tenant-form";

/**
 * Create-tenant page (docs/08 Fase 7). superAdmin only; re-checks `admin.tenants`
 * server-side. The form posts to the audited admin Server Action.
 */
export default async function NewTenantPage() {
  const t = await getTranslations("admin.create");

  const ctx = await requireSuperAdminContext();
  requirePermission(ctx.role, "admin.tenants");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-3xl text-ink">{t("title")}</h1>
        <p className="font-body text-[14px] text-muted">{t("subtitle")}</p>
      </div>
      <CreateTenantForm />
    </div>
  );
}
