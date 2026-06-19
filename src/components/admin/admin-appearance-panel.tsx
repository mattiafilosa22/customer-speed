"use client";

import { useCallback } from "react";

import type { OrganizationBranding } from "@/server/organization";
import type { UpdateThemeInput, UpdateBrandingInput } from "@/server/organization";
import { AppearancePanel } from "@/components/appearance/appearance-panel";
import { AppearanceQueryProvider } from "@/components/appearance/query-provider";
import {
  updateTenantBrandingAction,
  updateTenantThemeAction,
} from "@/app/(admin)/admin/actions";

/**
 * Admin wrapper around the REUSED white-label `AppearancePanel`. It binds the
 * panel's save callbacks to the admin Server Actions for a SPECIFIC target
 * tenant (`organizationId`), so the superAdmin configures any tenant's theme/brand
 * with the exact same UI + contrast validation + live preview as the tenant's own
 * "Aspetto & brand" page. Persistence flows through the admin actions (audited,
 * `admin.tenants` gated, cross-tenant) instead of the tenant `settings.tenant`
 * actions — that is the only difference.
 */
export function AdminAppearancePanel({
  organizationId,
  initial,
}: {
  organizationId: string;
  initial: OrganizationBranding;
}) {
  const onSaveTheme = useCallback(
    (input: UpdateThemeInput) => updateTenantThemeAction(organizationId, input),
    [organizationId],
  );
  const onSaveBranding = useCallback(
    (input: UpdateBrandingInput) => updateTenantBrandingAction(organizationId, input),
    [organizationId],
  );

  return (
    <AppearanceQueryProvider>
      <AppearancePanel initial={initial} onSaveTheme={onSaveTheme} onSaveBranding={onSaveBranding} />
    </AppearanceQueryProvider>
  );
}
