"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";

import { ForbiddenError, requirePermission } from "@/lib/rbac";
import { UnauthorizedError, ValidationError } from "@/lib/errors";
import { requireTenantContext } from "@/lib/tenant";
import {
  buildOrganizationDeps,
  updateOrganizationRetention,
  type UpdateRetentionInput,
} from "@/server/organization";
import {
  buildErasureDeps,
  buildExportDeps,
  countRetentionCandidates,
  exportRetentionCandidates,
  purgeRetentionCandidates,
  purgeRetentionCandidatesSchema,
  resolveRetentionMonths,
  retentionMonthsOverrideSchema,
  type RetentionBulkExport,
  type RetentionPurgeResult,
} from "@/server/privacy";
import { parseInput } from "@/server/validation";
import {
  type ActionState,
  type ErrorKeyMap,
  fail,
  toActionState,
} from "@/server/actions/action-result";

/**
 * Data-retention (lead cleanup) Server Actions — the ONLY boundary the
 * settings screen talks to (docs/00 §1: UI → Server Action → use case →
 * Prisma). Two capabilities are involved, matching the sensitivity of each
 * operation (docs/02 §2.1):
 *
 *  - `settings.tenant` (proUser/superAdmin): read/save the retention WINDOW
 *    itself (`leadRetentionMonths`) and preview HOW MANY leads it currently
 *    matches. No personal data is exposed by these two actions — only a
 *    count — so they do NOT require the GDPR export capability.
 *  - `lead.exportData` / `lead.eraseData` (proUser/superAdmin, never
 *    baseUser): the actual bulk backup export and bulk purge, reusing the
 *    exact same GDPR DSR capabilities as the per-lead actions in
 *    `leads/actions.ts` — these use cases handle PII / irreversible erasure.
 *
 * Two response shapes coexist, each mirroring an EXISTING pattern in this
 * codebase rather than inventing a third: the settings-form actions throw a
 * stable i18n key (matches `settings/appearance/actions.ts`, consumed by a
 * TanStack Query mutation), while the bulk export/purge actions return a
 * discriminated `ActionState`-shaped result (matches the GDPR export/erase
 * actions in `leads/actions.ts`).
 */

const gdprErrorKeys: ErrorKeyMap = {
  unauthorized: "gdpr.errors.unauthorized",
  conflict: "gdpr.errors.generic",
  rateLimited: "gdpr.errors.generic",
  generic: "gdpr.errors.generic",
  fieldErrorKey: (field) => `gdpr.errors.fields.${field || "form"}`,
};

function rethrowAsKey(error: unknown): never {
  if (error instanceof ValidationError) {
    throw new Error("dataRetention.errors.invalid");
  }
  if (error instanceof UnauthorizedError || error instanceof ForbiddenError) {
    throw new Error("dataRetention.errors.unauthorized");
  }
  throw new Error("dataRetention.errors.generic");
}

/** Re-render the leads/pipeline/dashboard views a bulk purge affects. */
function retentionPaths(): void {
  revalidatePath("/[locale]/(app)/leads", "page");
  revalidatePath("/[locale]/(app)/pipeline", "page");
  revalidatePath("/[locale]/(app)/dashboard", "page");
}

// ── Settings: read/save the retention window ────────────────────────────────

export interface RetentionSettingsResult {
  readonly ok: true;
}

/**
 * Persist `Organization.leadRetentionMonths` (a positive integer 1–120 enables
 * the policy, `null` disables it). Gated by `settings.tenant`, same capability
 * as the theme/brand panel.
 */
export async function updateRetentionSettingsAction(
  input: UpdateRetentionInput,
): Promise<RetentionSettingsResult> {
  try {
    const ctx = await requireTenantContext();
    requirePermission(ctx.role, "settings.tenant");
    const deps = buildOrganizationDeps(ctx);
    await updateOrganizationRetention(deps, input);
    revalidatePath("/[locale]/(app)/settings/data-retention", "page");
    return { ok: true };
  } catch (error) {
    rethrowAsKey(error);
  }
}

export interface RetentionCountResult {
  readonly count: number;
  readonly retentionMonths: number | null;
}

/**
 * Preview count for the settings screen: "N lead verranno interessati dalla
 * prossima pulizia". Read-only, no personal data exposed (count only), so this
 * is gated by `settings.tenant` — NOT `lead.exportData` (docs task note: a
 * count is not an export of personal data).
 */
export async function getRetentionCandidatesCountAction(): Promise<RetentionCountResult> {
  try {
    const ctx = await requireTenantContext();
    requirePermission(ctx.role, "settings.tenant");
    // Reused read-only tenant deps builder (named for the per-lead export use
    // case, but it is just "tenant-scoped Prisma client + audit + actor" — no
    // audit record is written here, and no PII leaves this action).
    const deps = buildExportDeps(ctx);
    return await countRetentionCandidates(deps);
  } catch (error) {
    rethrowAsKey(error);
  }
}

// ── Bulk backup export (mandatory before purge) ─────────────────────────────

/**
 * Discriminated result for the BULK EXPORT: on success it carries the full
 * DSR-grade backup payload (so the client can offer it as a JSON download,
 * reusing the same `downloadBlob` mechanism as the per-lead export) plus the
 * exact `leadIds` that were just exported — `exportRetentionCandidates` itself
 * does not return that list directly (it only puts it in the audit `meta`), so
 * this action derives it from `data.leads[].subject.id`, which is exactly the
 * candidate set the export covered.
 */
export type ExportRetentionResult =
  | { status: "success"; filename: string; data: RetentionBulkExport; leadIds: string[] }
  | (ActionState & { status: "error" });

/**
 * Bulk-export the current retention candidates (right of access/portability,
 * docs/06 §6.5, applied to the whole batch). `monthsOverride` lets an operator
 * preview a different window than the saved one; omitted, it falls back to
 * `Organization.leadRetentionMonths` (disabled tenant → an empty, still-valid
 * export, not an error).
 */
export async function exportRetentionCandidatesAction(
  monthsOverride?: number,
): Promise<ExportRetentionResult> {
  try {
    const ctx = await requireTenantContext();
    requirePermission(ctx.role, "lead.exportData");
    const deps = buildExportDeps(ctx);

    const parsedOverride =
      monthsOverride === undefined
        ? undefined
        : parseInput(retentionMonthsOverrideSchema, monthsOverride);
    const resolvedMonths = await resolveRetentionMonths(deps, parsedOverride);

    // `resolvedMonths === null` = retention not configured for this tenant:
    // `exportRetentionCandidates`/`listRetentionCandidates` already treat a
    // non-positive `months` as "match nothing" (defense in depth), so 0
    // yields the correct empty-but-valid export without a special case here.
    const data = await exportRetentionCandidates(deps, resolvedMonths ?? 0);

    return {
      status: "success",
      filename: `retention-export-${data.exportedAt.slice(0, 10)}.json`,
      data,
      leadIds: data.leads.map((lead) => lead.subject.id),
    };
  } catch (error) {
    unstable_rethrow(error);
    const state = toActionState(error, gdprErrorKeys);
    if (state.status === "error") return state;
    return fail(gdprErrorKeys.generic) as ActionState & { status: "error" };
  }
}

// ── Bulk purge (irreversible anonymization) ─────────────────────────────────

export type PurgeRetentionResult =
  | ({ status: "success" } & RetentionPurgeResult)
  | (ActionState & { status: "error" });

/**
 * Bulk-purge (anonymize) the leads in `leadIds` — right to be forgotten,
 * docs/06 §6.5, applied to the whole batch.
 *
 * SECURITY NOTE — export→purge is a UX guardrail, NOT a server-side control:
 * this action trusts whatever `leadIds` the client sends (Zod only checks
 * their SHAPE, not that they were actually just exported). The client-side
 * rule "the purge button only enables after a backup download in the same
 * session" is a UX safety net to avoid accidental data loss, not a security
 * boundary — a network client could call this action directly with any id
 * list. The actual, non-bypassable security boundary is the `lead.eraseData`
 * capability check below: it is granted only to proUser/superAdmin, never
 * baseUser (docs/02 §2.1), so only an already-trusted operator can reach this
 * at all, and `purgeRetentionCandidates` still enforces tenant isolation
 * per id (a foreign-tenant id fails, never anonymizes another tenant's lead).
 */
export async function purgeRetentionCandidatesAction(
  leadIds: readonly string[],
): Promise<PurgeRetentionResult> {
  try {
    const ctx = await requireTenantContext();
    requirePermission(ctx.role, "lead.eraseData");
    const deps = buildErasureDeps(ctx);

    const { leadIds: validated } = parseInput(purgeRetentionCandidatesSchema, { leadIds });
    const result = await purgeRetentionCandidates(deps, validated);

    retentionPaths();
    return { status: "success", ...result };
  } catch (error) {
    unstable_rethrow(error);
    const state = toActionState(error, gdprErrorKeys);
    if (state.status === "error") return state;
    return fail(gdprErrorKeys.generic) as ActionState & { status: "error" };
  }
}
