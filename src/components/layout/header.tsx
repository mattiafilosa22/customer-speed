import { getTranslations } from "next-intl/server";

import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { MobileDrawer } from "@/components/layout/mobile-drawer";
import { UserMenu } from "@/components/layout/user-menu";

interface HeaderProps {
  appName: string;
  /** Display name of the authenticated user (shown in the user menu). */
  userName: string;
  /** Active locale, forwarded to the logout action for a localized redirect. */
  locale: string;
}

/**
 * App header (landmark <header>). Hosts the mobile drawer trigger (hidden on
 * desktop where the fixed sidebar is visible), the language switcher and the
 * authenticated user menu (logout). Sticky so it stays reachable on scroll.
 * Theme-driven surface/border tokens only.
 */
export async function Header({ appName, userName, locale }: HeaderProps) {
  const t = await getTranslations("account");
  return (
    <header className="sticky top-0 z-30 flex min-h-14 items-center gap-3 border-b border-line bg-panel px-4">
      <MobileDrawer appName={appName} />
      {/* Reserved for breadcrumb / page title (later phases). */}
      <div className="flex-1" />
      <LanguageSwitcher />
      <UserMenu
        userName={userName}
        locale={locale}
        labels={{ greeting: t("loggedInAs"), logout: t("logout") }}
      />
    </header>
  );
}
