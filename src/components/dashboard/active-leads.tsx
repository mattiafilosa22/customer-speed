import { getTranslations } from "next-intl/server";

import type { ActiveLeadsResult } from "@/server/dashboard";
import { Card, CardBody } from "@/components/ui";
import { Link } from "@/i18n/navigation";
import { StagePill } from "@/components/leads/stage-pill";

/**
 * "Lead totali" foot list (docs/02 §2.2): active (non-terminal) leads ordered by
 * days-in-stage DESC — the most "stuck" first. Each row: initials avatar, name,
 * email, stage pill (coloured + labelled), "N giorni" badge, link to the detail.
 *
 * Server component; responsive (the row wraps on mobile). Empty state when no
 * active lead. Reuses the shared "days" pluralized string from the leads
 * namespace (single source of truth).
 */
export async function ActiveLeads({ active }: { active: ActiveLeadsResult }) {
  const t = await getTranslations("dashboard.active");
  const tl = await getTranslations("leads");

  const fullName = (first: string, last: string): string => `${first} ${last}`;
  const initials = (first: string, last: string): string =>
    `${first.charAt(0)}${last.charAt(0)}`.toUpperCase();

  return (
    <Card>
      <CardBody className="flex flex-col gap-4">
        <h2 className="font-display text-ink text-lg">{t("title")}</h2>

        {active.data.length === 0 ? (
          <p className="font-body text-muted text-[13.5px]">{t("empty")}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {active.data.map((lead) => (
              <li key={lead.id}>
                <Link
                  href={`/leads/${lead.id}`}
                  className="focus-visible:outline-ring border-line2 hover:bg-accent-soft flex flex-wrap items-center gap-3 rounded border-b pb-3 last:border-0 focus-visible:outline-2 focus-visible:outline-offset-2"
                  aria-label={tl("openLead", {
                    name: fullName(lead.firstName, lead.lastName),
                  })}
                >
                  <span
                    aria-hidden="true"
                    className="bg-accent-soft font-body text-accent-ink flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold"
                  >
                    {initials(lead.firstName, lead.lastName)}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="font-body text-ink truncate font-medium">
                      {fullName(lead.firstName, lead.lastName)}
                    </span>
                    {lead.email ? (
                      <span className="font-body text-muted truncate text-[13px]">
                        {lead.email}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StagePill stage={lead.stage} />
                    <span className="label-mono rounded-pill bg-line2 text-ink inline-flex items-center px-2.5 py-0.5">
                      {tl("days", { count: lead.daysInStage })}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
