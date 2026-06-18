import type { ReactNode } from "react";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { routing } from "@/i18n/routing";
import { INDIGO_THEME } from "@/lib/theme";
import { ThemeProvider } from "@/components/theme/theme-style";
import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";

/**
 * Authenticated app shell: themed wrapper + fixed sidebar (desktop) + header
 * (hosts the mobile drawer + language switcher) + main content landmark.
 *
 * Fase 0: the tenant is not resolved yet, so we apply the Indigo default and
 * fall back to the i18n `app.name` for the displayed name. In Fase 1 the tenant
 * context supplies the real `Organization.theme` and `appName` (resolveTheme +
 * getTenantContext), without changing this composition. The theme is injected
 * server-side (no FOUC).
 */
export default async function AppLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);
  const t = await getTranslations("app");
  const appName = t("name");

  return (
    <ThemeProvider theme={INDIGO_THEME}>
      <div className="flex min-h-screen bg-bg">
        <Sidebar appName={appName} />
        <div className="flex min-w-0 flex-1 flex-col">
          <Header appName={appName} />
          <main className="min-w-0 flex-1 p-4 lg:p-6">{children}</main>
        </div>
      </div>
    </ThemeProvider>
  );
}
