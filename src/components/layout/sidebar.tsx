import { Brand } from "@/components/layout/brand";
import { SidebarNav } from "@/components/layout/sidebar-nav";

interface SidebarProps {
  appName: string;
}

/**
 * Fixed desktop sidebar (>= lg). Hidden on mobile/tablet, where navigation
 * moves into the drawer (see MobileDrawer). Width is the themed --sidebar
 * token. Landmark: <aside> with a labelled <nav> inside.
 */
export function Sidebar({ appName }: SidebarProps) {
  return (
    <aside className="hidden w-sidebar shrink-0 border-r border-line bg-panel lg:block">
      <div className="flex h-full flex-col gap-4 p-4">
        <div className="flex min-h-11 items-center px-2">
          <Brand appName={appName} />
        </div>
        {/* i18n: aria-label da esternalizzare in messages/* */}
        <nav aria-label="Navigazione principale" className="flex-1">
          <SidebarNav />
        </nav>
      </div>
    </aside>
  );
}
