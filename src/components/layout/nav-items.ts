import type { ComponentType, SVGProps } from "react";

import {
  AppointmentsIcon,
  DashboardIcon,
  LeadIcon,
  PipelineIcon,
  SettingsIcon,
} from "@/components/layout/icons";

/**
 * Single source of truth for the app navigation. Kept in one place (not
 * scattered inline) so the labels are trivially externalizable to i18n.
 *
 * // i18n: `labelKey` will resolve via next-intl (messages/*); `label` is a
 * //       placeholder used until unit E wires next-intl.
 */
export interface NavItem {
  /** Stable key — also the future i18n message key (e.g. nav.dashboard). */
  readonly labelKey: string;
  /** Placeholder Italian label (to be replaced by next-intl). */
  readonly label: string;
  readonly href: string;
  readonly icon: ComponentType<SVGProps<SVGSVGElement>>;
}

export const NAV_ITEMS: ReadonlyArray<NavItem> = [
  { labelKey: "nav.dashboard", label: "Dashboard", href: "/dashboard", icon: DashboardIcon },
  { labelKey: "nav.pipeline", label: "Pipeline", href: "/pipeline", icon: PipelineIcon },
  { labelKey: "nav.leads", label: "Lead", href: "/leads", icon: LeadIcon },
  {
    labelKey: "nav.appointments",
    label: "Appuntamenti",
    href: "/appointments",
    icon: AppointmentsIcon,
  },
  { labelKey: "nav.settings", label: "Settings", href: "/settings", icon: SettingsIcon },
];
