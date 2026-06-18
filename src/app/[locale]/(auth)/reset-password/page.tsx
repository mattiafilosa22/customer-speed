import { getTranslations } from "next-intl/server";

import { AuthCard } from "@/components/auth/auth-card";
import { FormAlert } from "@/components/auth/form-alert";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { getPublicAppName } from "@/server/tenant/app-branding";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const t = await getTranslations("auth.resetPassword");
  const appName = await getPublicAppName();
  const { token } = await searchParams;

  return (
    <AuthCard appName={appName} title={t("title")} description={t("description")}>
      {token ? (
        <ResetPasswordForm token={token} />
      ) : (
        <FormAlert tone="error">{t("missingToken")}</FormAlert>
      )}
    </AuthCard>
  );
}
