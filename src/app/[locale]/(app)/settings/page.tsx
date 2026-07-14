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

  const tr = await getTranslations("dataRetention");
  const tl = await getTranslations("lossReasons");

  const ctx = await requireTenantContext();
  const flags = await getTenantFeatureFlags(ctx.organizationId);
  const showIntegrations = flags.calendarIntegrations && can(ctx.role, "calendar.integrations");
  const showAppearance = can(ctx.role, "settings.tenant");
  const showRetention = can(ctx.role, "settings.tenant");
  const showLossReasons = can(ctx.role, "settings.tenant");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-ink text-3xl">{t("title")}</h1>
        <p className="font-body text-muted text-[14px]">{t("description")}</p>
      </div>

      {showAppearance ? (
        <section aria-labelledby="appearance-link-heading">
          <Card>
            <CardBody className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <h2 id="appearance-link-heading" className="font-display text-ink text-xl">
                  {ta("title")}
                </h2>
                <p className="font-body text-muted text-[13px]">{ta("description")}</p>
              </div>
              <Link
                href="/settings/appearance"
                className="rounded-control border-line font-body text-ink hover:bg-accent-soft focus-visible:outline-ring inline-flex min-h-11 w-fit items-center justify-center border px-4 text-[13.5px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                {ta("manageLink")}
              </Link>
            </CardBody>
          </Card>
        </section>
      ) : null}

      {showRetention ? (
        <section aria-labelledby="data-retention-link-heading">
          <Card>
            <CardBody className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <h2 id="data-retention-link-heading" className="font-display text-ink text-xl">
                  {tr("title")}
                </h2>
                <p className="font-body text-muted text-[13px]">{tr("description")}</p>
              </div>
              <Link
                href="/settings/data-retention"
                className="rounded-control border-line font-body text-ink hover:bg-accent-soft focus-visible:outline-ring inline-flex min-h-11 w-fit items-center justify-center border px-4 text-[13.5px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                {tr("manageLink")}
              </Link>
            </CardBody>
          </Card>
        </section>
      ) : null}

      {showLossReasons ? (
        <section aria-labelledby="loss-reasons-link-heading">
          <Card>
            <CardBody className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <h2 id="loss-reasons-link-heading" className="font-display text-ink text-xl">
                  {tl("title")}
                </h2>
                <p className="font-body text-muted text-[13px]">{tl("description")}</p>
              </div>
              <Link
                href="/settings/loss-reasons"
                className="rounded-control border-line font-body text-ink hover:bg-accent-soft focus-visible:outline-ring inline-flex min-h-11 w-fit items-center justify-center border px-4 text-[13.5px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                {tl("manageLink")}
              </Link>
            </CardBody>
          </Card>
        </section>
      ) : null}

      <section aria-labelledby="change-password-heading">
        <Card>
          <CardBody className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <h2 id="change-password-heading" className="font-display text-ink text-xl">
                {tc("title")}
              </h2>
              <p className="font-body text-muted text-[13px]">{tc("description")}</p>
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
                <h2 id="integrations-link-heading" className="font-display text-ink text-xl">
                  {ti("title")}
                </h2>
                <p className="font-body text-muted text-[13px]">{ti("description")}</p>
              </div>
              <Link
                href="/settings/integrations"
                className="rounded-control border-line font-body text-ink hover:bg-accent-soft focus-visible:outline-ring inline-flex min-h-11 w-fit items-center justify-center border px-4 text-[13.5px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
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
