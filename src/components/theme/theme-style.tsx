import type { CSSProperties, ReactNode } from "react";

import {
  type ResolvedMode,
  type Theme,
  themeDataAttributes,
  themeToCssVars,
} from "@/lib/theme";

interface ThemeProviderProps {
  theme: Theme;
  /**
   * Effective light/dark mode (user toggle override resolved upstream). When
   * omitted, the theme's own stored mode is used.
   */
  mode?: ResolvedMode;
  children: ReactNode;
}

/**
 * Server component that applies a tenant's theme as inline CSS custom
 * properties on a wrapping element, overriding the defaults in tokens.css for
 * its subtree. Because the vars are rendered server-side into the initial HTML,
 * there is no FOUC: the first paint already uses the tenant palette/radius.
 *
 * It also sets the non-color switches as `data-*` attributes (`data-theme` for
 * light/dark, `data-button-style`, `data-density`) so tokens.css can key density
 * spacing and button radius off them declaratively. ("auto" mode resolves to a
 * concrete mode here; the OS-preference resolution lands client-side later.)
 *
 * Presentation only — the Theme is resolved upstream (tenant context / DB).
 */
export function ThemeProvider({ theme, mode, children }: ThemeProviderProps) {
  const cssVars = themeToCssVars(theme) as CSSProperties;

  return (
    <div
      {...themeDataAttributes(theme, mode)}
      /*
       * `fontFamily` is re-declared here, not only as a variable: `body` in
       * globals.css resolves `var(--f-body)` at the BODY level (above this
       * wrapper), and descendants then inherit the already-computed family.
       * Re-declaring it on the wrapper makes the tenant's --f-body actually win
       * for body text. Headings/mono re-declare their own family in globals.css,
       * so they resolve against this subtree already.
       */
      style={{ ...cssVars, fontFamily: "var(--f-body)" }}
      className="contents"
    >
      {children}
    </div>
  );
}
