import { getTranslations } from "next-intl/server";

import { PagePlaceholder } from "@/components/layout/page-placeholder";

export default async function PipelinePage() {
  const t = await getTranslations("pages.pipeline");
  return <PagePlaceholder title={t("title")} description={t("description")} />;
}
