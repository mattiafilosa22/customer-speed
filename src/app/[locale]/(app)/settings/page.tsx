import { getTranslations } from "next-intl/server";

import { can } from "@/lib/rbac";
import { requireTenantContext } from "@/lib/tenant";
import { getTenantFeatureFlags } from "@/server/tenant/feature-flags";
import { Card, CardBody } from "@/components/ui";
import { Link } from "@/i18n/navigation";
import { ChangePasswordForm } from "@/components/auth/change-password-form";

/**
 * Settings (Fase 1). Hosts the "Cambio Password" section (docs/06 §6.1). The
 * appearance/brand and tenant configuration panels land in later phases. The
 * change-password action resolves the actor from the server tenant context.
 *
 * Fase 6: when the tenant has `calendarIntegrations` ON and the user holds the
 * `calendar.integrations` capability, a link to the integrations sub-page is
 * shown. For Fabio (flag OFF) the link is absent (the page itself also 404s).
 */
export default async function SettingsPage() {
  const t = await getTranslations("pages.settings");
  const tc = await getTranslations("auth.changePassword");
  const ti = await getTranslations("integrations");
  const ta = await getTranslations("appearance");

  const ctx = await requireTenantContext();
  const flags = await getTenantFeatureFlags(ctx.organizationId);
  const showIntegrations = flags.calendarIntegrations && can(ctx.role, "calendar.integrations");
  const showAppearance = can(ctx.role, "settings.tenant");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-3xl text-ink">{t("title")}</h1>
        <p className="font-body text-[14px] text-muted">{t("description")}</p>
      </div>

      {showAppearance ? (
        <section aria-labelledby="appearance-link-heading">
          <Card>
            <CardBody className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <h2 id="appearance-link-heading" className="font-display text-xl text-ink">
                  {ta("title")}
                </h2>
                <p className="font-body text-[13px] text-muted">{ta("description")}</p>
              </div>
              <Link
                href="/settings/appearance"
                className="inline-flex w-fit min-h-11 items-center justify-center rounded-control border border-line px-4 font-body text-[13.5px] font-medium text-ink transition-colors hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                {ta("manageLink")}
              </Link>
            </CardBody>
          </Card>
        </section>
      ) : null}

      <section aria-labelledby="change-password-heading">
        <Card>
          <CardBody className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <h2 id="change-password-heading" className="font-display text-xl text-ink">
                {tc("title")}
              </h2>
              <p className="font-body text-[13px] text-muted">{tc("description")}</p>
            </div>
            <ChangePasswordForm />
          </CardBody>
        </Card>
      </section>

      {showIntegrations ? (
        <section aria-labelledby="integrations-link-heading">
          <Card>
            <CardBody className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <h2 id="integrations-link-heading" className="font-display text-xl text-ink">
                  {ti("title")}
                </h2>
                <p className="font-body text-[13px] text-muted">{ti("description")}</p>
              </div>
              <Link
                href="/settings/integrations"
                className="inline-flex w-fit min-h-11 items-center justify-center rounded-control border border-line px-4 font-body text-[13.5px] font-medium text-ink transition-colors hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                {ti("manageLink")}
              </Link>
            </CardBody>
          </Card>
        </section>
      ) : null}
    </div>
  );
}
