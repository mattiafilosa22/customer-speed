import { getTranslations } from "next-intl/server";

import { Card, CardBody } from "@/components/ui";
import { Link } from "@/i18n/navigation";

/**
 * Not-found boundary for the authenticated app segment. A page calling
 * `notFound()` (e.g. a lead id that is missing, deleted or cross-tenant) renders
 * this localized 404 inside the app shell instead of a blank page.
 */
export default async function AppNotFound() {
  const t = await getTranslations("errorBoundary");

  return (
    <div className="mx-auto max-w-[640px]">
      <Card>
        <CardBody className="flex flex-col items-center gap-3 py-12 text-center">
          <p className="font-display text-xl text-ink">{t("notFoundTitle")}</p>
          <p className="text-muted">{t("notFoundDescription")}</p>
          <Link href="/dashboard" className="mt-2 text-accent underline">
            {t("backToDashboard")}
          </Link>
        </CardBody>
      </Card>
    </div>
  );
}
