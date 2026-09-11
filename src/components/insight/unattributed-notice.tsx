import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";

export async function UnattributedNotice({ count }: { count: number }) {
  if (count === 0) return null;
  const t = await getTranslations("insight.unattributed");
  return (
    <aside className="flex flex-wrap items-center justify-between gap-3 rounded border border-warn bg-warn-soft px-4 py-3 text-sm text-ink">
      <p>{t("message", { count })}</p>
      <Link href="/leads?missingChatChannel=1" className="font-medium text-accent underline-offset-4 hover:underline">{t("cta")}</Link>
    </aside>
  );
}
