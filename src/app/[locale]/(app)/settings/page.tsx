import { getTranslations } from "next-intl/server";

import { Card, CardBody } from "@/components/ui";
import { ChangePasswordForm } from "@/components/auth/change-password-form";

/**
 * Settings (Fase 1). Hosts the "Cambio Password" section (docs/06 §6.1). The
 * appearance/brand and tenant configuration panels land in later phases. The
 * change-password action resolves the actor from the server tenant context.
 */
export default async function SettingsPage() {
  const t = await getTranslations("pages.settings");
  const tc = await getTranslations("auth.changePassword");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-3xl text-ink">{t("title")}</h1>
        <p className="font-body text-[14px] text-muted">{t("description")}</p>
      </div>

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
    </div>
  );
}
