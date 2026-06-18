import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { MobileDrawer } from "@/components/layout/mobile-drawer";

interface HeaderProps {
  appName: string;
}

/**
 * App header (landmark <header>). Hosts the mobile drawer trigger (hidden on
 * desktop where the fixed sidebar is visible) and the language switcher. Sticky
 * so it stays reachable on scroll. Theme-driven surface/border tokens only.
 */
export function Header({ appName }: HeaderProps) {
  return (
    <header className="sticky top-0 z-30 flex min-h-14 items-center gap-3 border-b border-line bg-panel px-4">
      <MobileDrawer appName={appName} />
      {/* Reserved for breadcrumb / page title (later phases). */}
      <div className="flex-1" />
      <LanguageSwitcher />
    </header>
  );
}
