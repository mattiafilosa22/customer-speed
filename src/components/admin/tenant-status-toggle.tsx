"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui";
import { useMessage } from "@/components/auth/use-message";
import { setOrganizationActiveAction } from "@/app/(admin)/admin/actions";

/**
 * Quick suspend/activate toggle for a tenant in the list (docs/08 Fase 7).
 * Calls the audited admin Server Action; on success refreshes the route so the
 * server-rendered status badge updates. Permission is enforced server-side in
 * the action — this control is cosmetic gating only.
 */
export function TenantStatusToggle({
  organizationId,
  isSuspended,
}: {
  organizationId: string;
  isSuspended: boolean;
}) {
  const t = useTranslations("admin.tenants");
  const tm = useMessage();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const next = isSuspended; // if suspended → action activates (active=true)

  function handleClick() {
    setError(null);
    startTransition(async () => {
      try {
        await setOrganizationActiveAction({ organizationId, active: next });
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "admin.errors.generic");
      }
    });
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <Button variant="ghost" size="sm" onClick={handleClick} disabled={pending}>
        {isSuspended ? t("actions.activate") : t("actions.suspend")}
      </Button>
      {error ? (
        <span role="alert" className="font-body text-[11px] text-stage-lost">
          {tm(error)}
        </span>
      ) : null}
    </span>
  );
}
