import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Bebas_Neue, IBM_Plex_Mono, Montserrat } from "next/font/google";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { routing } from "@/i18n/routing";
import { CookieBannerGate } from "@/components/cookie/cookie-banner-gate";

import "@/styles/globals.css";

/*
 * Typography (docs/05 §5.2), self-hosted via next/font (no layout shift, no
 * external request at runtime). Each font exposes a CSS variable that feeds the
 * --f-* tokens consumed by globals.css / tokens.css. `display: "swap"` keeps
 * text visible during font load and pairs with prefers-reduced-motion handling
 * already in globals.css.
 */
const fontDisplay = Bebas_Neue({
  subsets: ["latin"],
  weight: "400",
  variable: "--f-display",
  display: "swap",
});

const fontBody = Montserrat({
  subsets: ["latin"],
  variable: "--f-body",
  display: "swap",
});

const fontMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--f-mono",
  display: "swap",
});

/** Pre-render both locales statically (no per-request locale resolution cost). */
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const resolvedLocale = hasLocale(routing.locales, locale)
    ? locale
    : routing.defaultLocale;
  const t = await getTranslations({ locale: resolvedLocale, namespace: "app" });
  // The white-label app name comes from Organization.appName (per-tenant) in
  // later phases; here it falls back to the i18n catalogue.
  return {
    title: t("name"),
    description: t("description"),
  };
}

export default async function LocaleLayout({
  children,
  params,
}: Readonly<{
  children: ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;
  // Validate the incoming locale from the `[locale]` segment; unknown → 404.
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  // Enable static rendering: makes the request locale available to all server
  // components in this subtree without opting into dynamic rendering.
  setRequestLocale(locale);

  return (
    <html
      lang={locale}
      className={`${fontDisplay.variable} ${fontBody.variable} ${fontMono.variable}`}
    >
      <body>
        <NextIntlClientProvider>
          {children}
          <CookieBannerGate />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
