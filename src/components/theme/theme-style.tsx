import type { CSSProperties, ReactNode } from "react";

import { type Theme, themeToCssVars } from "@/lib/theme";

interface ThemeProviderProps {
  theme: Theme;
  children: ReactNode;
}

/**
 * Server component that applies a tenant's theme as inline CSS custom
 * properties on a wrapping element, overriding the defaults in tokens.css for
 * its subtree. Because the vars are rendered server-side into the initial HTML,
 * there is no FOUC: the first paint already uses the tenant palette/radius.
 *
 * It also sets `data-theme` so the dark-mode token mirror in tokens.css can
 * activate when the tenant chooses "dark". ("auto" is resolved to a concrete
 * mode by the appearance layer in a later phase; here it falls back to light.)
 *
 * Presentation only — the Theme is resolved upstream (tenant context / DB).
 */
export function ThemeProvider({ theme, children }: ThemeProviderProps) {
  const cssVars = themeToCssVars(theme) as CSSProperties;
  const dataTheme = theme.mode === "dark" ? "dark" : "light";

  return (
    <div data-theme={dataTheme} style={cssVars} className="contents">
      {children}
    </div>
  );
}
