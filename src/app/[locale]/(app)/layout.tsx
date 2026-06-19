import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound, redirect as nextRedirect } from "next/navigation";

import { asLocale, routing } from "@/i18n/routing";
import { redirect } from "@/i18n/navigation";
import { type ResolvedMode, resolveMode, THEME_MODE_COOKIE } from "@/lib/theme";
import { ThemeProvider } from "@/components/theme/theme-style";
import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";
import { getSessionUser } from "@/server/auth/guards";
import { enabledFeatureKeys, getTenantFeatureFlags } from "@/server/tenant/feature-flags";
import { getShellBranding } from "@/server/organization/get-shell-branding";

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

  // The whole `(app)` tree is TENANT-SCOPED: every page resolves a
  // `TenantContext`, which `requireTenantContext()` refuses for a superAdmin
  // (they operate in the explicit cross-tenant `(admin)/` context — docs/01 §1.3,
  // docs/02 §2.1). Login always lands users on `/dashboard`, so without this
  // guard a superAdmin would hit a tenant-only page and get a 500
  // ("Tenant context required"). Route them to their admin area instead — the
  // symmetric counterpart of the `(admin)/` layout's "non-superAdmin → /dashboard"
  // guard. `/admin` is non-localized (lives outside `[locale]`).
  if (user.role === "superAdmin") {
    // `/admin` is NON-localized (outside `[locale]`), so use the plain Next.js
    // redirect — the locale-aware one would prefix it (e.g. `/en/admin`), which
    // does not exist.
    nextRedirect("/admin");
  }

  const t = await getTranslations("app");

  // Per-tenant white-label: theme (palette/radius/component style) + displayed
  // name, resolved from the AUTHENTICATED user's organization. Applying the
  // saved theme here is what makes the appearance panel take effect app-wide
  // (server-injected CSS vars, no FOUC). Falls back to the i18n product name.
  const branding = await getShellBranding(user.organizationId, t("name"));
  const appName = branding.appName;

  // Per-tenant feature flags drive which modules appear in the shell (nav +
  // mini-calendar). Resolved from the AUTHENTICATED user's organization id.
  const flags = await getTenantFeatureFlags(user.organizationId);
  const enabledFeatures = enabledFeatureKeys(flags);

  // Light/dark mode: the user's toggle choice (cookie) overrides the tenant's
  // stored mode. Resolved server-side so the first paint matches (no FOUC).
  const cookieMode = (await cookies()).get(THEME_MODE_COOKIE)?.value;
  const mode: ResolvedMode = resolveMode(
    branding.theme,
    cookieMode === "light" || cookieMode === "dark" ? cookieMode : null,
  );

  return (
    <ThemeProvider theme={branding.theme} mode={mode}>
      <div className="flex min-h-screen bg-bg">
        <Sidebar appName={appName} enabledFeatures={enabledFeatures} />
        <div className="flex min-w-0 flex-1 flex-col">
          <Header
            appName={appName}
            userName={user.name}
            locale={locale}
            enabledFeatures={enabledFeatures}
            mode={mode}
          />
          <main className="min-w-0 flex-1 p-4 lg:p-6">{children}</main>
        </div>
      </div>
    </ThemeProvider>
  );
}
