"use client";

import { useTranslations } from "next-intl";

import { cn } from "@/lib/cn";
import type { FeatureFlagKey } from "@/lib/feature-flags";
import { NAV_ITEMS } from "@/components/layout/nav-items";
import { Link, usePathname } from "@/i18n/navigation";

interface SidebarNavProps {
  /** Called after a nav item activates — used by the drawer to close itself. */
  onNavigate?: () => void;
  /**
   * Feature flags the tenant has ENABLED (serializable string keys). A nav item
   * with a `feature` is shown only when its flag is in this list; items without
   * one are always shown. Defaults to "all features enabled" so callers that do
   * not gate (e.g. tests) keep the full nav.
   */
  enabledFeatures?: ReadonlyArray<FeatureFlagKey>;
}

/**
 * The navigation list. Marks the active route with `aria-current="page"` (not
 * color alone) and resolves "active" on the route segment so child routes keep
 * the parent highlighted. Each item is a 44px-tall touch target with a visible
 * focus ring.
 *
 * Uses the locale-aware `Link`/`usePathname` from `@/i18n/navigation`: the
 * pathname is returned WITHOUT the locale prefix, so the comparisons stay
 * locale-agnostic and the links get the active locale prefix automatically.
 * Labels come from the `nav.*` messages — no hard-coded copy.
 */
export function SidebarNav({ onNavigate, enabledFeatures }: SidebarNavProps) {
  const pathname = usePathname();
  const t = useTranslations("nav");

  // Filter feature-gated items. When `enabledFeatures` is omitted, show all.
  const items = enabledFeatures
    ? NAV_ITEMS.filter((item) => !item.feature || enabledFeatures.includes(item.feature))
    : NAV_ITEMS;

  return (
    <ul className="flex flex-col gap-1">
      {items.map((item) => {
        const isActive =
          pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;

        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              onClick={onNavigate}
              className={cn(
                "flex min-h-11 items-center gap-3 rounded-control px-3 font-body text-[13.5px]",
                "transition-colors",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                isActive
                  ? "bg-accent-soft font-medium text-accent"
                  : "text-ink hover:bg-accent-soft",
              )}
            >
              <Icon className={isActive ? "text-accent" : "text-muted"} />
              <span>{t(item.messageKey)}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
