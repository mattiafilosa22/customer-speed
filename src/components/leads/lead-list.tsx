import { getTranslations } from "next-intl/server";

import type { LeadListItem } from "@/server/leads";
import { Card } from "@/components/ui";
import { Link } from "@/i18n/navigation";
import { StagePill } from "@/components/leads/stage-pill";

/**
 * Responsive lead list (docs/05: table on >=md, card list on mobile). Server
 * Component — renders the already-fetched, paginated rows (no client state). The
 * "giorni" badge and stage pill carry TEXT (not colour-only) for WCAG 1.4.1.
 *
 * `StagePill` is an async Server Component rendered as a CHILD element (React 19
 * awaits child promises); the `.map()` callbacks stay synchronous.
 */
export async function LeadList({ leads }: { leads: readonly LeadListItem[] }) {
  const t = await getTranslations("leads");

  const fullName = (lead: LeadListItem): string => `${lead.firstName} ${lead.lastName}`;
  const initials = (lead: LeadListItem): string =>
    `${lead.firstName.charAt(0)}${lead.lastName.charAt(0)}`.toUpperCase();

  return (
    <>
      {/* Desktop / tablet: real table with a header row. */}
      <Card className="hidden overflow-hidden md:block">
        <table className="w-full border-collapse">
          <caption className="sr-only">{t("title")}</caption>
          <thead>
            <tr className="border-line border-b text-left">
              <th scope="col" className="label-mono text-muted px-4 py-3">
                {t("table.name")}
              </th>
              <th scope="col" className="label-mono text-muted px-4 py-3">
                {t("table.contact")}
              </th>
              <th scope="col" className="label-mono text-muted px-4 py-3">
                {t("table.source")}
              </th>
              <th scope="col" className="label-mono text-muted px-4 py-3">
                {t("table.days")}
              </th>
              <th scope="col" className="label-mono text-muted px-4 py-3">
                {t("table.stage")}
              </th>
              <th scope="col" className="px-4 py-3">
                <span className="sr-only">{t("open")}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {leads.map((lead) => (
              <tr
                key={lead.id}
                className="border-line2 hover:bg-accent-soft border-b last:border-0"
              >
                <th scope="row" className="px-4 py-3 text-left font-normal">
                  <div className="flex items-center gap-3">
                    <Avatar>{initials(lead)}</Avatar>
                    <span className="font-body text-ink font-medium">{fullName(lead)}</span>
                  </div>
                </th>
                <td className="font-body text-muted px-4 py-3 text-[13px]">
                  <div className="flex flex-col">
                    {lead.email ? <span>{lead.email}</span> : null}
                    {lead.phone ? <span>{lead.phone}</span> : null}
                    {!lead.email && !lead.phone ? <span>—</span> : null}
                  </div>
                </td>
                <td className="font-body text-muted px-4 py-3 text-[13px]">
                  {lead.source?.label ?? "—"}
                </td>
                <td className="px-4 py-3">
                  <DaysBadge label={t("days", { count: lead.daysInStage })} />
                </td>
                <td className="px-4 py-3">
                  <StagePill stage={lead.stage} />
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/leads/${lead.id}`}
                    className="font-body text-accent focus-visible:outline-ring text-[13px] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
                    aria-label={t("openLead", { name: fullName(lead) })}
                  >
                    {t("open")} ›
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/* Mobile: card list (one card per lead, fully tappable). */}
      <ul className="flex flex-col gap-3 md:hidden">
        {leads.map((lead) => (
          <li key={lead.id}>
            <Card>
              <Link
                href={`/leads/${lead.id}`}
                className="focus-visible:outline-ring flex flex-col gap-2 p-4 focus-visible:outline-2 focus-visible:outline-offset-2"
                aria-label={t("openLead", { name: fullName(lead) })}
              >
                <div className="flex items-center gap-3">
                  <Avatar>{initials(lead)}</Avatar>
                  <div className="flex min-w-0 flex-col">
                    <span className="font-body text-ink truncate font-medium">
                      {fullName(lead)}
                    </span>
                    {lead.email ? (
                      <span className="font-body text-muted truncate text-[13px]">
                        {lead.email}
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <StagePill stage={lead.stage} />
                  <DaysBadge label={t("days", { count: lead.daysInStage })} />
                  {lead.source ? (
                    <span className="font-body text-muted text-[12px]">{lead.source.label}</span>
                  ) : null}
                </div>
              </Link>
            </Card>
          </li>
        ))}
      </ul>
    </>
  );
}

function Avatar({ children }: { children: string }) {
  return (
    <span
      aria-hidden="true"
      className="bg-accent-soft font-body text-accent-ink flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold"
    >
      {children}
    </span>
  );
}

/** Days-in-stage badge: shows a localized, already-pluralized "N giorni" text. */
function DaysBadge({ label }: { label: string }) {
  return (
    <span className="label-mono rounded-pill bg-line2 text-ink inline-flex items-center px-2.5 py-0.5">
      {label}
    </span>
  );
}
