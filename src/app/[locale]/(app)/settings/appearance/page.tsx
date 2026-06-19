import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { can } from "@/lib/rbac";
import { requireTenantContext } from "@/lib/tenant";
import { buildOrganizationDeps, getOrganizationBranding } from "@/server/organization";
import { AppearancePanel } from "@/components/appearance/appearance-panel";
import { AppearanceQueryProvider } from "@/components/appearance/query-provider";

/**
 * "Aspetto & brand" page (docs/05 §5.4, Fase 7).
 *
 * Gated by the `settings.tenant` capability (proUser / superAdmin — NOT baseUser,
 * docs/02 §2.1). A user without it gets a 404 (not 403) so the route does not
 * reveal the feature's existence — and the Server Actions re-check server-side
 * regardless (defense in depth). Loads the tenant's current branding/theme and
 * hands it to the client panel as the initial draft.
 */
export default async function AppearancePage() {
  const t = await getTranslations("appearance");

  const ctx = await requireTenantContext();
  if (!can(ctx.role, "settings.tenant")) {
    notFound();
  }

  const deps = buildOrganizationDeps(ctx);
  const branding = await getOrganizationBranding(deps);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-3xl text-ink">{t("title")}</h1>
        <p className="max-w-2xl font-body text-[14px] text-muted">{t("description")}</p>
      </div>

      <AppearanceQueryProvider>
        <AppearancePanel initial={branding} />
      </AppearanceQueryProvider>
    </div>
  );
}
