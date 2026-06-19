import { hasLocale } from "next-intl";
import { notFound } from "next/navigation";

import { routing } from "@/i18n/routing";
import { redirect } from "@/i18n/navigation";

/**
 * Root entry point. CustomerSpeed is an authenticated CRM, so the index simply
 * forwards to the app: `/dashboard` renders for an authenticated user, or the
 * `(app)` guard redirects an anonymous visitor to `/login`. Keeping the redirect
 * here (rather than a bare scaffold placeholder) means opening the app always
 * lands on the product, never on a placeholder page.
 */
export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  redirect({ href: "/dashboard", locale });
}
