import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Bebas_Neue, IBM_Plex_Mono, Inter, Manrope, Montserrat } from "next/font/google";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { routing } from "@/i18n/routing";
import { CookieBannerGate } from "@/components/cookie/cookie-banner-gate";

import "@/styles/globals.css";

/*
 * Typography (docs/05 §5.2), self-hosted via next/font (no layout shift, no
 * external request at runtime). EVERY family offered by the appearance panel
 * (src/lib/theme-fonts.ts → FONT_PAIRS) is loaded here, each exposing its OWN
 * CSS variable (--f-bebas, --f-montserrat, …). The ROLE tokens (--f-display /
 * --f-body / --f-mono) are then pointed at one of these variables per tenant by
 * `themeToCssVars` (defaults in tokens.css) — that indirection is what makes the
 * font selector actually take effect: next/font hashes the real family name, so
 * a theme can never name a family directly.
 *
 * `display: "swap"` keeps text visible during font load.
 */
const fontBebas = Bebas_Neue({
  subsets: ["latin"],
  weight: "400",
  variable: "--f-bebas",
  display: "swap",
});

const fontMontserrat = Montserrat({
  subsets: ["latin"],
  variable: "--f-montserrat",
  display: "swap",
});

const fontInter = Inter({
  subsets: ["latin"],
  variable: "--f-inter",
  display: "swap",
});

const fontManrope = Manrope({
  subsets: ["latin"],
  variable: "--f-manrope",
  display: "swap",
});

const fontMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--f-plex-mono",
  display: "swap",
});

const fontVariables = [
  fontBebas.variable,
  fontMontserrat.variable,
  fontInter.variable,
  fontManrope.variable,
  fontMono.variable,
].join(" ");

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
      className={fontVariables}
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
