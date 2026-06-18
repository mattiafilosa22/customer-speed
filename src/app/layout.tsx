import type { Metadata } from "next";
import type { ReactNode } from "react";

import "@/styles/globals.css";

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
    <html lang="it">
      <body>{children}</body>
    </html>
  );
}
