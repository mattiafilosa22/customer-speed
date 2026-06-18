import { getTranslations } from "next-intl/server";

import { PagePlaceholder } from "@/components/layout/page-placeholder";

export default async function SettingsPage() {
  const t = await getTranslations("pages.settings");
  return <PagePlaceholder title={t("title")} description={t("description")} />;
}
