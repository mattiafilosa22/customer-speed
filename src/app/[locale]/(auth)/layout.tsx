import type { ReactNode } from "react";
import { hasLocale } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { routing } from "@/i18n/routing";
import { INDIGO_THEME } from "@/lib/theme";
import { ThemeProvider } from "@/components/theme/theme-style";

/**
 * Auth route-group shell. Standalone (no app sidebar/header): the auth screens
 * are a separate flow. Applies the Indigo default theme server-side (no FOUC);
 * in a later phase the tenant theme is resolved from the host/slug. Each page
 * provides its own <main> via AuthCard.
 */
export default async function AuthLayout({
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

  return <ThemeProvider theme={INDIGO_THEME}>{children}</ThemeProvider>;
}
