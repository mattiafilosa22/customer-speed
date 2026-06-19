import { createNavigation } from "next-intl/navigation";

import { routing } from "@/i18n/routing";

/**
 * Locale-aware wrappers around Next.js' navigation APIs. Always import `Link`,
 * `redirect`, `usePathname`, `useRouter` and `getPathname` from here (not from
 * `next/link` / `next/navigation`) so the active locale prefix is applied
 * automatically and consistently with `routing`.
 */
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
