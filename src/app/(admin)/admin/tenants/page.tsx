import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { requireSuperAdminContext } from "@/lib/tenant";
import { createAuditLogger } from "@/server/audit/audit-log";
import { buildAdminDeps, listOrganizations } from "@/server/admin";
import { formatDateShort } from "@/i18n/format";
import { Card, CardBody, Pill } from "@/components/ui";
import { LinkButton } from "@/components/admin/link-button";
import { TenantStatusToggle } from "@/components/admin/tenant-status-toggle";

/**
 * Tenant list (docs/04 §4.10, docs/08 Fase 7) — paginated table of ALL tenants
 * with synthetic metrics (users, leads) and quick actions. superAdmin only;
 * re-checks `admin.tenants` server-side.
 *
 * Pagination is offset-based via the `?page=` search param (docs/00 §3 — never an
 * unbounded list). The metrics come DB-side from `listOrganizations` (zero N+1).
 */
const PAGE_SIZE = 20;

export default async function AdminTenantsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const t = await getTranslations("admin.tenants");

  const ctx = await requireSuperAdminContext();
  requirePermission(ctx.role, "admin.tenants");

  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1);

  const deps = buildAdminDeps(ctx);
  const { items, total, pageSize } = await listOrganizations(deps, { page, pageSize: PAGE_SIZE });

  // Cross-tenant read (the operator listing every tenant) is traceable.
  await createAuditLogger(prisma).record({
    action: "admin.tenants.view",
    actorId: ctx.userId,
    organizationId: null,
    meta: { page },
  });

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const createdLabels = await Promise.all(items.map((o) => formatDateShort(o.createdAt)));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-3xl text-ink">{t("title")}</h1>
          <p className="font-body text-[14px] text-muted">{t("subtitle", { count: total })}</p>
        </div>
        <LinkButton href="/admin/tenants/new">{t("create")}</LinkButton>
      </div>

      <Card>
        <CardBody className="p-0">
          {items.length === 0 ? (
            <p className="p-6 font-body text-[14px] text-muted">{t("empty")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <caption className="sr-only">{t("title")}</caption>
                <thead>
                  <tr className="border-b border-line">
                    <th scope="col" className="px-4 py-3 font-body text-[12px] text-muted">
                      {t("table.name")}
                    </th>
                    <th scope="col" className="px-4 py-3 font-body text-[12px] text-muted">
                      {t("table.slug")}
                    </th>
                    <th scope="col" className="px-4 py-3 font-body text-[12px] text-muted">
                      {t("table.users")}
                    </th>
                    <th scope="col" className="px-4 py-3 font-body text-[12px] text-muted">
                      {t("table.leads")}
                    </th>
                    <th scope="col" className="px-4 py-3 font-body text-[12px] text-muted">
                      {t("table.status")}
                    </th>
                    <th scope="col" className="px-4 py-3 font-body text-[12px] text-muted">
                      {t("table.created")}
                    </th>
                    <th scope="col" className="px-4 py-3 text-right font-body text-[12px] text-muted">
                      {t("table.actions")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((org, i) => (
                    <tr key={org.id} className="border-b border-line2 last:border-0">
                      <td className="px-4 py-3 font-body text-[14px] text-ink">
                        <Link
                          href={`/admin/tenants/${org.id}`}
                          className="font-medium hover:underline"
                        >
                          {org.name}
                        </Link>
                        <div className="font-body text-[12px] text-muted">{org.appName}</div>
                      </td>
                      <td className="px-4 py-3 font-mono text-[13px] text-muted">{org.slug}</td>
                      <td className="px-4 py-3 font-body text-[14px] text-ink">{org.userCount}</td>
                      <td className="px-4 py-3 font-body text-[14px] text-ink">{org.leadCount}</td>
                      <td className="px-4 py-3">
                        {org.isSuspended ? (
                          <Pill tone="exec">{t("status.suspended")}</Pill>
                        ) : (
                          <Pill tone="ok">{t("status.active")}</Pill>
                        )}
                      </td>
                      <td className="px-4 py-3 font-body text-[13px] text-muted">
                        {createdLabels[i]}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <LinkButton
                            href={`/admin/tenants/${org.id}`}
                            variant="ghost"
                            size="sm"
                          >
                            {t("table.configure")}
                          </LinkButton>
                          <TenantStatusToggle
                            organizationId={org.id}
                            isSuspended={org.isSuspended}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      {totalPages > 1 ? (
        <nav
          aria-label={t("pagination.label")}
          className="flex items-center justify-between gap-3"
        >
          <LinkButton
            href={`/admin/tenants?page=${page - 1}`}
            variant="ghost"
            size="sm"
            disabled={page <= 1}
          >
            {t("pagination.prev")}
          </LinkButton>
          <span className="font-body text-[13px] text-muted">
            {t("pagination.status", { page, totalPages })}
          </span>
          <LinkButton
            href={`/admin/tenants?page=${page + 1}`}
            variant="ghost"
            size="sm"
            disabled={page >= totalPages}
          >
            {t("pagination.next")}
          </LinkButton>
        </nav>
      ) : null}
    </div>
  );
}
