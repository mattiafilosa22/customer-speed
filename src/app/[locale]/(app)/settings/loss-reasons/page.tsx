import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { can } from "@/lib/rbac";
import { requireTenantContext } from "@/lib/tenant";
import { buildLossReasonDeps, listLossReasons } from "@/server/loss-reasons";
import { LossReasonsPanel } from "@/components/settings/loss-reasons-panel";

/**
 * "Motivi di perdita" (loss reasons) settings page (docs/02 §2.5-bis).
 *
 * Gated by the `settings.tenant` capability (proUser / superAdmin — NOT
 * baseUser, docs/02 §2.1), mirroring "Pulizia lead persi": a user without it
 * gets a 404 (not 403) so the route does not reveal the feature's existence,
 * and every Server Action re-checks server-side regardless (defense in
 * depth). Loads the FULL tenant list (active + inactive — Settings manages
 * both) as the initial state for the client panel.
 */
export default async function LossReasonsPage() {
  const t = await getTranslations("lossReasons");

  const ctx = await requireTenantContext();
  if (!can(ctx.role, "settings.tenant")) {
    notFound();
  }

  const deps = buildLossReasonDeps(ctx);
  const reasons = await listLossReasons(deps, { includeInactive: true });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-ink text-3xl">{t("title")}</h1>
        <p className="font-body text-muted max-w-2xl text-[14px]">{t("description")}</p>
      </div>

      <LossReasonsPanel initialReasons={reasons} />
    </div>
  );
}
