import type { ReactNode } from "react";

import { INDIGO_THEME } from "@/lib/theme";
import { ThemeProvider } from "@/components/theme/theme-style";
import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";

/**
 * Authenticated app shell: themed wrapper + fixed sidebar (desktop) + header
 * (hosts the mobile drawer) + main content landmark.
 *
 * Fase 0: the tenant is not resolved yet, so we apply the Indigo default and a
 * placeholder appName. In Fase 1 the tenant context supplies the real
 * `Organization.theme` and `appName` (resolveTheme + getTenantContext), without
 * changing this composition. The theme is injected server-side (no FOUC).
 */

// i18n: da esternalizzare in messages/* (Organization.appName in Fase 1).
const APP_NAME = "CustomerSpeed";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider theme={INDIGO_THEME}>
      <div className="flex min-h-screen bg-bg">
        <Sidebar appName={APP_NAME} />
        <div className="flex min-w-0 flex-1 flex-col">
          <Header appName={APP_NAME} />
          <main className="min-w-0 flex-1 p-4 lg:p-6">{children}</main>
        </div>
      </div>
    </ThemeProvider>
  );
}
