import { getTranslations } from "next-intl/server";

import { PagePlaceholder } from "@/components/layout/page-placeholder";

export default async function LeadsPage() {
  const t = await getTranslations("pages.leads");
  return <PagePlaceholder title={t("title")} description={t("description")} />;
}
