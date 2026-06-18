import { getTranslations } from "next-intl/server";

import { PagePlaceholder } from "@/components/layout/page-placeholder";

export default async function AppointmentsPage() {
  const t = await getTranslations("pages.appointments");
  return <PagePlaceholder title={t("title")} description={t("description")} />;
}
