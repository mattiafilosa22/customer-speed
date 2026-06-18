import { getTranslations } from "next-intl/server";

import type { FeatureFlagKey } from "@/lib/feature-flags";
import { Brand } from "@/components/layout/brand";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { MiniCalendar } from "@/components/appointments/mini-calendar";

interface SidebarProps {
  appName: string;
  /** Feature flags the tenant has enabled (drives nav + mini-calendar). */
  enabledFeatures: ReadonlyArray<FeatureFlagKey>;
}

/**
 * Fixed desktop sidebar (>= lg). Hidden on mobile/tablet, where navigation
 * moves into the drawer (see MobileDrawer). Width is the themed --sidebar
 * token. Landmark: <aside> with a labelled <nav> inside (label localized).
 *
 * When the tenant has the `appointments` feature, the sidebar also hosts the
 * mini-calendar (docs/02 §2.7) under the nav.
 */
export async function Sidebar({ appName, enabledFeatures }: SidebarProps) {
  const t = await getTranslations("nav");
  const showCalendar = enabledFeatures.includes("appointments");

  return (
    <aside className="hidden w-sidebar shrink-0 border-r border-line bg-panel lg:block">
      <div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
        <div className="flex min-h-11 items-center px-2">
          <Brand appName={appName} />
        </div>
        <nav aria-label={t("ariaLabel")}>
          <SidebarNav enabledFeatures={enabledFeatures} />
        </nav>
        {showCalendar ? <MiniCalendar /> : null}
      </div>
    </aside>
  );
}
