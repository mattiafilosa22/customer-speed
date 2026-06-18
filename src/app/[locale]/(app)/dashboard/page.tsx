import { getTranslations } from "next-intl/server";

import { PagePlaceholder } from "@/components/layout/page-placeholder";

export default async function DashboardPage() {
  const t = await getTranslations("pages.dashboard");
  return <PagePlaceholder title={t("title")} description={t("description")} />;
}
