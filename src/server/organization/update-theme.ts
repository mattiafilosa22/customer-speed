import { ValidationError } from "@/lib/errors";
import { validateThemeContrast } from "@/lib/contrast";
import type { Prisma } from "@/generated/prisma/client";
import { parseInput } from "@/server/validation";
import type { OrganizationDeps } from "@/server/organization/deps";
import { updateThemeSchema } from "@/server/organization/schemas";

/**
 * Persist the tenant's white-label THEME (docs/05 §5.4).
 *
 * Two-stage validation:
 *  1. SHAPE — the existing `themeSchema` (Zod) guarantees a well-formed theme
 *     (valid hex colors, radius 0–22, known fonts/preset/mode, …).
 *  2. CONTRAST (WCAG AA) — `validateThemeContrast` checks the readable color
 *     pairs. A failure on a CRITICAL pair (e.g. body text on the surface, button
 *     label on the accent) BLOCKS the save (`report.passes === false`) and is
 *     surfaced as a `ValidationError` keyed `theme` with stable issue codes, so
 *     the UI can localize. Advisory `warning` issues (e.g. --muted, documented as
 *     ~3.5:1) do NOT block — the panel shows them as cautions in the live preview.
 *
 * DECISION (docs/05 §5.6): critical pairs block, advisory pairs warn. This keeps
 * a tenant from shipping unreadable UI while still allowing the documented
 * "large/secondary text only" muted color.
 *
 * Isolation: writes `where: { id: actor.organizationId }` (server context) — a
 * tenant can only update its own organization.
 */
export interface UpdateThemeResult {
  readonly ok: true;
}

export async function updateOrganizationTheme(
  deps: OrganizationDeps,
  input: unknown,
): Promise<UpdateThemeResult> {
  const { theme } = parseInput(updateThemeSchema, input);

  const report = validateThemeContrast(theme);
  if (!report.passes) {
    // One message per failing CRITICAL pair, keyed under `theme` so the form can
    // map the stable pair code (e.g. "ink-on-panel") to localized copy.
    const messages = report.issues
      .filter((i) => i.severity === "error")
      .map((i) => `contrast.${i.pair}`);
    throw new ValidationError({ theme: messages });
  }

  await deps.prisma.organization.update({
    where: { id: deps.actor.organizationId },
    data: { theme: theme as unknown as Prisma.InputJsonValue },
  });

  await deps.audit.record({
    action: "settings.theme.update",
    organizationId: deps.actor.organizationId,
    actorId: deps.actor.userId,
    entity: "Organization",
    entityId: deps.actor.organizationId,
    meta: {
      preset: theme.preset,
      mode: theme.mode,
      radius: theme.radius,
      accent: theme.colors.accent,
      // Record advisory contrast warnings for audit (non-blocking).
      warnings: report.issues.filter((i) => i.severity === "warning").map((i) => i.pair),
    },
  });

  return { ok: true };
}
