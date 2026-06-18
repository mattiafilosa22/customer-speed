import { getTranslations } from "next-intl/server";

import { AuthCard } from "@/components/auth/auth-card";
import { RegisterForm } from "@/components/auth/register-form";
import { getPublicAppName } from "@/server/tenant/app-branding";

export default async function RegisterPage() {
  const t = await getTranslations("auth.register");
  const appName = await getPublicAppName();

  return (
    <AuthCard appName={appName} title={t("title")} description={t("description")}>
      <RegisterForm />
    </AuthCard>
  );
}
