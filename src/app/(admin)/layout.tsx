import type { ReactNode } from "react";
import { Bebas_Neue, IBM_Plex_Mono, Montserrat } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getLocale } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { getSessionUser } from "@/server/auth/guards";

import "@/styles/globals.css";

/**
 * Cross-tenant admin area shell. It lives OUTSIDE `[locale]` (not localized via
 * routing) and is reserved for the `superAdmin` operator (docs/01 §1.3, docs/02
 * §2.1).
 *
 * i18n in the non-localized admin (docs/08 Fase 7 note): there is no `[locale]`
 * segment here, so the request locale falls back to the DEFAULT (`it`) via the
 * next-intl request config. Server components use `getTranslations`; client
 * components (the reused white-label panel, the forms) need a client provider,
 * so we wrap the tree in `NextIntlClientProvider` with the server-loaded
 * messages. ALL admin copy lives under the centralized `admin.*` namespace in
 * `messages/it.json` + `messages/en.json` — no hard-coded strings.
 *
 * Authoritative server-side guard (defense in depth — the actions re-check too):
 *  - no session → /login,
 *  - authenticated but NOT superAdmin → /dashboard (least-revealing safe default;
 *    avoids leaking the admin area's existence to ordinary users).
 *
 * The admin context is the explicit, audited cross-tenant context; every admin
 * write is recorded by the use cases.
 */

const fontDisplay = Bebas_Neue({
  subsets: ["latin"],
  weight: "400",
  variable: "--f-display",
  display: "swap",
});
const fontBody = Montserrat({ subsets: ["latin"], variable: "--f-body", display: "swap" });
const fontMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--f-mono",
  display: "swap",
});

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }
  if (user.role !== "superAdmin") {
    redirect("/dashboard");
  }

  const locale = await getLocale();
  const messages = await getMessages();
  const t = await getTranslations("admin");

  return (
    <html
      lang={locale}
      className={`${fontDisplay.variable} ${fontBody.variable} ${fontMono.variable}`}
    >
      <body>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <div className="min-h-screen bg-bg">
            <header className="border-b border-line bg-panel">
              <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
                <div className="flex items-baseline gap-3">
                  <Link href="/admin" className="font-display text-2xl text-ink">
                    {t("brand")}
                  </Link>
                  <span className="font-body text-[12px] text-muted">{t("brandSub")}</span>
                </div>
                <nav aria-label={t("nav.label")} className="flex items-center gap-4">
                  <Link href="/admin" className="font-body text-[14px] text-ink hover:underline">
                    {t("nav.dashboard")}
                  </Link>
                  <Link
                    href="/admin/tenants"
                    className="font-body text-[14px] text-ink hover:underline"
                  >
                    {t("nav.tenants")}
                  </Link>
                </nav>
              </div>
            </header>
            <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
          </div>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
