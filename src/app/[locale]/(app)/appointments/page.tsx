import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { requireTenantContext } from "@/lib/tenant";
import { can } from "@/lib/rbac";
import { buildAppointmentDeps, listAppointments } from "@/server/appointments";
import { buildLeadDeps, listLeadOptions } from "@/server/leads";
import { getTenantFeatureFlags } from "@/server/tenant/feature-flags";
import { formatDateShort } from "@/i18n/format";
import { romeDayRangeUtc } from "@/lib/rome-day";
import { Card, CardBody } from "@/components/ui";
import { Link } from "@/i18n/navigation";
import { AppointmentTabs } from "@/components/appointments/appointment-tabs";
import { AppointmentList } from "@/components/appointments/appointment-list";
import { AppointmentPagination } from "@/components/appointments/appointment-pagination";
import { AppointmentDialog } from "@/components/appointments/appointment-dialog";

/**
 * "I miei appuntamenti" — the appointment agenda (docs/02 §2.6).
 *
 * Server Component: filter/page/date live in the URL `searchParams` (shareable,
 * SSR-friendly). It enforces the per-tenant feature flag (`appointments`) and the
 * RBAC capability (`appointment.manage`) server-side — both 404 when not allowed,
 * never revealing the area. Then it runs the `listAppointments` use case (one
 * batched, paginated query set) and renders the responsive list with status tabs,
 * the create dialog and pagination. The optional `?date=` (mini-calendar click)
 * narrows the list to one day.
 */
export default async function AppointmentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = await getTranslations("appointments");
  const sp = await searchParams;

  const ctx = await requireTenantContext();

  // Feature-flag gate (docs/08: appointments off ⇒ no module). 404 = non-revealing.
  const flags = await getTenantFeatureFlags(ctx.organizationId);
  if (!flags.appointments) {
    notFound();
  }
  // Server-authoritative RBAC (robust to future per-tenant overrides; baseUser
  // has no appointments capability). 404 (not 403) avoids revealing the area.
  if (!can(ctx.role, "appointment.manage")) {
    notFound();
  }

  const deps = buildAppointmentDeps(ctx);
  const leadDeps = buildLeadDeps(ctx);

  const flat = (key: string): string | undefined => {
    const value = sp[key];
    return Array.isArray(value) ? value.at(-1) : value;
  };

  const dateParam = flat("date");
  const query = {
    filter: flat("filter"),
    date: dateParam,
    page: flat("page"),
  };

  const [result, leads] = await Promise.all([
    listAppointments(deps, query),
    listLeadOptions(leadDeps),
  ]);

  // Validate + format the active-day chip (invalid date param simply ignored by
  // the use case; we only show the chip when it parses).
  let activeDayLabel: string | null = null;
  if (dateParam) {
    try {
      activeDayLabel = await formatDateShort(romeDayRangeUtc(dateParam).gte);
    } catch {
      activeDayLabel = null;
    }
  }

  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1>{t("title")}</h1>
          <p className="text-muted">{t("count", { count: result.total })}</p>
        </div>
        <AppointmentDialog leads={leads} />
      </header>

      <Card>
        <CardBody className="flex flex-col gap-4">
          <AppointmentTabs counts={result.counts} />
          {activeDayLabel ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="label-mono rounded-pill bg-accent-soft text-accent-ink inline-flex items-center px-2.5 py-0.5">
                {t("dayFilter", { date: activeDayLabel })}
              </span>
              <Link
                href="/appointments"
                className="font-body text-[13px] text-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                {t("clearDayFilter")}
              </Link>
            </div>
          ) : null}
        </CardBody>
      </Card>

      {result.data.length === 0 ? (
        <Card>
          <CardBody className="flex flex-col items-center gap-2 py-12 text-center">
            <p className="font-display text-xl text-ink">{t("empty.title")}</p>
            <p className="text-muted">{t("empty.description")}</p>
          </CardBody>
        </Card>
      ) : (
        <>
          <AppointmentList appointments={result.data} leads={leads} />
          <AppointmentPagination
            page={result.page}
            pageSize={result.pageSize}
            total={result.total}
          />
        </>
      )}
    </div>
  );
}
