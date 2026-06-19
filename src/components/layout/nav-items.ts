import type { ComponentType, SVGProps } from "react";

import type { FeatureFlagKey } from "@/lib/feature-flags";
import {
  AppointmentsIcon,
  DashboardIcon,
  LeadIcon,
  PipelineIcon,
  SettingsIcon,
} from "@/components/layout/icons";

/** Keys of the `nav` message namespace that act as item labels. */
type NavMessageKey =
  | "dashboard"
  | "pipeline"
  | "leads"
  | "appointments"
  | "settings";

/**
 * Single source of truth for the app navigation. Labels are NOT stored here —
 * `messageKey` resolves against the `nav.*` next-intl namespace at render time
 * (see SidebarNav), so there is no hard-coded copy. Hrefs are locale-agnostic;
 * the locale-aware `Link` from `@/i18n/navigation` adds the prefix.
 *
 * `feature` (optional) gates the item behind a per-tenant feature flag: when set
 * and the tenant has the flag OFF, the item is filtered out before rendering
 * (`visibleNavItems`). Items without a `feature` are always shown.
 */
export interface NavItem {
  /** Key within the `nav` message namespace (e.g. "dashboard"). */
  readonly messageKey: NavMessageKey;
  /** Locale-agnostic path; the localized Link applies the locale prefix. */
  readonly href: string;
  readonly icon: ComponentType<SVGProps<SVGSVGElement>>;
  /** Optional tenant feature flag that must be ON for the item to appear. */
  readonly feature?: FeatureFlagKey;
}

export const NAV_ITEMS: ReadonlyArray<NavItem> = [
  { messageKey: "dashboard", href: "/dashboard", icon: DashboardIcon },
  { messageKey: "pipeline", href: "/pipeline", icon: PipelineIcon },
  { messageKey: "leads", href: "/leads", icon: LeadIcon },
  {
    messageKey: "appointments",
    href: "/appointments",
    icon: AppointmentsIcon,
    feature: "appointments",
  },
  { messageKey: "settings", href: "/settings", icon: SettingsIcon },
];

/** The nav items visible for a tenant given its enabled feature flags. */
export function visibleNavItems(
  flags: Readonly<Record<FeatureFlagKey, boolean>>,
): ReadonlyArray<NavItem> {
  return NAV_ITEMS.filter((item) => !item.feature || flags[item.feature]);
}
