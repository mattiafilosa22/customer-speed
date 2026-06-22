"use server";

import { unstable_rethrow } from "next/navigation";

import { signOut } from "@/lib/auth";
import { asLocale } from "@/i18n/routing";
import { redirect } from "@/i18n/navigation";
import { prisma } from "@/lib/prisma";
import { getTenantContext, requireTenantContext } from "@/lib/tenant";
import { createAuditLogger } from "@/server/audit/audit-log";
import { buildAuthDeps, changePassword } from "@/server/auth";
import {
  type ActionState,
  type ErrorKeyMap,
  ok,
  toActionState,
} from "@/server/actions/action-result";
import { getRequestMeta } from "@/server/actions/request-meta";

/**
 * Authenticated-area account actions (change password + logout). Unlike the
 * (auth) actions these require an active tenant context: `requireTenantContext()`
 * throws `UnauthorizedError` when there is no session, and the actor (userId /
 * organizationId) is taken from the SERVER context — never from the client
 * (docs/06 §6.1, §6.3). The `changePassword` use case bumps `sessionVersion`,
 * invalidating other JWT sessions.
 */

const errorKeys: ErrorKeyMap = {
  unauthorized: "auth.changePassword.errors.unauthorized",
  conflict: "auth.errors.generic",
  rateLimited: "auth.errors.rateLimited",
  generic: "auth.errors.generic",
  fieldErrorKey: (field) => `auth.errors.fields.${field || "newPassword"}`,
};

function field(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

export async function changePasswordAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    // Auth + tenant context first (throws → mapped to unauthorized key).
    const ctx = await requireTenantContext();
    const meta = await getRequestMeta();
    const deps = buildAuthDeps(meta);

    await changePassword(
      deps,
      { userId: ctx.userId, organizationId: ctx.organizationId },
      {
        currentPassword: field(form, "currentPassword"),
        newPassword: field(form, "newPassword"),
      },
    );

    return ok("auth.changePassword.success");
  } catch (error) {
    unstable_rethrow(error);
    return toActionState(error, errorKeys);
  }
}

/** Sign the user out and return to the localized login page for the SAME tenant. */
export async function logoutAction(formData: FormData): Promise<void> {
  const locale = asLocale(formData.get("locale") as string | null);

  // Resolve the tenant slug BEFORE clearing the session, so we return the user to
  // THEIR tenant login (`/login?org=<slug>`) and not the platform-default login —
  // otherwise a non-default tenant (e.g. Fabio) would land on the wrong tenant and
  // be unable to sign back in. Best-effort + audited: a failure here must not block
  // the sign-out (the security-critical step), so we swallow errors and fall back
  // to the bare login.
  let orgSlug: string | undefined;
  try {
    const meta = await getRequestMeta();
    const ctx = await getTenantContext();
    if (ctx.kind === "tenant") {
      const org = await prisma.organization.findUnique({
        where: { id: ctx.organizationId },
        select: { slug: true },
      });
      orgSlug = org?.slug;
    }
    await createAuditLogger(prisma).record({
      action: "auth.logout",
      organizationId: ctx.kind === "tenant" ? ctx.organizationId : null,
      actorId: ctx.userId,
      entity: "User",
      entityId: ctx.userId,
      ip: meta.ip,
    });
  } catch {
    // No active/valid session or audit write failed — proceed to sign out.
  }

  await signOut({ redirect: false });
  redirect({ href: orgSlug ? { pathname: "/login", query: { org: orgSlug } } : "/login", locale });
}
