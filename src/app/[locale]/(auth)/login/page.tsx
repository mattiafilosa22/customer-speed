import { getTranslations } from "next-intl/server";

import { AuthCard } from "@/components/auth/auth-card";
import { LoginForm } from "@/components/auth/login-form";
import { getPublicAppName } from "@/server/tenant/app-branding";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string }>;
}) {
  const t = await getTranslations("auth.login");
  const appName = await getPublicAppName();
  const { org } = await searchParams;

  return (
    <AuthCard appName={appName} title={t("title")} description={t("description")}>
      <LoginForm organizationSlug={org} />
    </AuthCard>
  );
}
