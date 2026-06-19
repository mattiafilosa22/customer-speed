import { prisma } from "@/lib/prisma";
import { resolveTheme, type Theme } from "@/lib/theme";

/**
 * Resolve the white-label data the AUTHENTICATED app shell needs (theme + the
 * displayed name + textual mark) for a tenant by its `organizationId`.
 *
 * The id comes from the authenticated session (never client input), so the base
 * client is fine — it cannot reach another tenant via a server-trusted id. The
 * theme is normalized through `resolveTheme` (falls back to the Indigo default on
 * a missing/malformed row) so the shell always renders with a valid theme; this
 * is what makes a tenant's saved palette/radius apply across the whole app
 * (injected server-side by ThemeProvider, no FOUC).
 */
export interface ShellBranding {
  readonly theme: Theme;
  readonly appName: string;
  readonly markFallback: string | null;
  readonly poweredBy: boolean;
}

export async function getShellBranding(
  organizationId: string,
  fallbackAppName: string,
): Promise<ShellBranding> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { appName: true, theme: true, markFallback: true, poweredBy: true },
  });

  return {
    theme: resolveTheme(org?.theme),
    appName: org?.appName ?? fallbackAppName,
    markFallback: org?.markFallback ?? null,
    poweredBy: org?.poweredBy ?? true,
  };
}
