import type { ReactNode } from "react";

/**
 * Root layout. With locale-prefixed routing the real `<html>`/`<body>` (and the
 * locale-aware `lang` attribute, fonts and providers) live in
 * `src/app/[locale]/layout.tsx`. Next.js still requires a root layout, so this
 * one is a transparent pass-through.
 *
 * `globals.css` is imported in the locale layout alongside the fonts.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
