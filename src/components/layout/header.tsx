import { getTranslations } from "next-intl/server";

import type { FeatureFlagKey } from "@/lib/feature-flags";
import type { ResolvedMode } from "@/lib/theme";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { MobileDrawer } from "@/components/layout/mobile-drawer";
import { ThemeModeToggle } from "@/components/layout/theme-mode-toggle";
import { UserMenu } from "@/components/layout/user-menu";

interface HeaderProps {
  appName: string;
  /** Display name of the authenticated user (shown in the user menu). */
  userName: string;
  /** Active locale, forwarded to the logout action for a localized redirect. */
  locale: string;
  /** Feature flags the tenant has enabled (drives the mobile drawer nav). */
  enabledFeatures: ReadonlyArray<FeatureFlagKey>;
  /** Effective light/dark mode (drives the toggle's initial icon/state). */
  mode: ResolvedMode;
}

/**
 * App header (landmark <header>). Hosts the mobile drawer trigger (hidden on
 * desktop where the fixed sidebar is visible), the language switcher and the
 * authenticated user menu (logout). Sticky so it stays reachable on scroll.
 * Theme-driven surface/border tokens only.
 */
export async function Header({
  appName,
  userName,
  locale,
  enabledFeatures,
  mode,
}: HeaderProps) {
  const t = await getTranslations("account");
  return (
    <header className="sticky top-0 z-30 flex min-h-14 items-center gap-2 border-b border-line bg-panel px-4 sm:gap-3 sm:px-6">
      <MobileDrawer appName={appName} enabledFeatures={enabledFeatures} />
      {/* Reserved for breadcrumb / page title (later phases). */}
      <div className="flex-1" />
      <ThemeModeToggle initialMode={mode} />
      <LanguageSwitcher />
      <UserMenu
        userName={userName}
        locale={locale}
        labels={{ greeting: t("loggedInAs"), logout: t("logout") }}
      />
    </header>
  );
}
