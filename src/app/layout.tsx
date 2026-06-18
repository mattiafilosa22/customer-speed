import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Bebas_Neue, IBM_Plex_Mono, Montserrat } from "next/font/google";

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

export const metadata: Metadata = {
  // Placeholder metadata. The white-label app name comes from
  // Organization.appName (per-tenant) in later phases — not hard-coded here.
  title: "CustomerSpeed",
  description: "Multi-tenant CRM platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  // Locale is hard-coded to `it` as a Fase 0 placeholder. The i18n agent (unit E)
  // will drive lang/dir from the resolved next-intl locale.
  return (
    <html
      lang="it"
      className={`${fontDisplay.variable} ${fontBody.variable} ${fontMono.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
