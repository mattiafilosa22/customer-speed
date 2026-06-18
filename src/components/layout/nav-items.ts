import type { ComponentType, SVGProps } from "react";

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
 */
export interface NavItem {
  /** Key within the `nav` message namespace (e.g. "dashboard"). */
  readonly messageKey: NavMessageKey;
  /** Locale-agnostic path; the localized Link applies the locale prefix. */
  readonly href: string;
  readonly icon: ComponentType<SVGProps<SVGSVGElement>>;
}

export const NAV_ITEMS: ReadonlyArray<NavItem> = [
  { messageKey: "dashboard", href: "/dashboard", icon: DashboardIcon },
  { messageKey: "pipeline", href: "/pipeline", icon: PipelineIcon },
  { messageKey: "leads", href: "/leads", icon: LeadIcon },
  { messageKey: "appointments", href: "/appointments", icon: AppointmentsIcon },
  { messageKey: "settings", href: "/settings", icon: SettingsIcon },
];
