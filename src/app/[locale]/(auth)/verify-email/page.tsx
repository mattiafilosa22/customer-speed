import { getTranslations } from "next-intl/server";

import { AuthCard } from "@/components/auth/auth-card";
import { VerifyEmailClient } from "@/components/auth/verify-email-client";
import { getPublicAppName } from "@/server/tenant/app-branding";

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const t = await getTranslations("auth.verifyEmail");
  const appName = await getPublicAppName();
  const { token } = await searchParams;

  return (
    <AuthCard appName={appName} title={t("title")} description={t("description")}>
      <VerifyEmailClient token={token ?? ""} />
    </AuthCard>
  );
}
