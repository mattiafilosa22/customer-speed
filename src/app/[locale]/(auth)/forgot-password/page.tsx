import { getTranslations } from "next-intl/server";

import { AuthCard } from "@/components/auth/auth-card";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { getPublicAppName } from "@/server/tenant/app-branding";

export default async function ForgotPasswordPage() {
  const t = await getTranslations("auth.forgotPassword");
  const appName = await getPublicAppName();

  return (
    <AuthCard appName={appName} title={t("title")} description={t("description")}>
      <ForgotPasswordForm />
    </AuthCard>
  );
}
