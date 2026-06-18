import type { ReactNode } from "react";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { asLocale, routing } from "@/i18n/routing";
import { redirect } from "@/i18n/navigation";
import { INDIGO_THEME } from "@/lib/theme";
import { ThemeProvider } from "@/components/theme/theme-style";
import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";
import { getSessionUser } from "@/server/auth/guards";
import { enabledFeatureKeys, getTenantFeatureFlags } from "@/server/tenant/feature-flags";

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

  // Server-side guard: no valid session → localized redirect to login. This is
  // the authoritative check (the middleware redirect is a fast first line only).
  const user = await getSessionUser();
  if (!user) {
    // `redirect` throws to interrupt rendering; the explicit `return` also
    // narrows `user` to non-null for the rest of the layout (the next-intl
    // redirect is not typed as `never`).
    redirect({ href: "/login", locale: asLocale(locale) });
    return null;
  }

  const t = await getTranslations("app");
  const appName = t("name");

  // Per-tenant feature flags drive which modules appear in the shell (nav +
  // mini-calendar). Resolved from the AUTHENTICATED user's organization id.
  const flags = await getTenantFeatureFlags(user.organizationId);
  const enabledFeatures = enabledFeatureKeys(flags);

  return (
    <ThemeProvider theme={INDIGO_THEME}>
      <div className="flex min-h-screen bg-bg">
        <Sidebar appName={appName} enabledFeatures={enabledFeatures} />
        <div className="flex min-w-0 flex-1 flex-col">
          <Header
            appName={appName}
            userName={user.name}
            locale={locale}
            enabledFeatures={enabledFeatures}
          />
          <main className="min-w-0 flex-1 p-4 lg:p-6">{children}</main>
        </div>
      </div>
    </ThemeProvider>
  );
}
