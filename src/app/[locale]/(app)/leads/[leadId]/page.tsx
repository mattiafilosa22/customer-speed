import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { NotFoundError } from "@/lib/errors";
import { requireTenantContext } from "@/lib/tenant";
import { can } from "@/lib/rbac";
import { LeadStage } from "@/generated/prisma/enums";
import type { LeadDetailRow } from "@/server/leads";
import {
  buildLeadDeps,
  getLead,
  listLeadSources,
  listLossReasons,
} from "@/server/leads";
import { buildInvoiceDeps, listInvoices } from "@/server/invoices";
import { Card, CardBody } from "@/components/ui";
import { Link } from "@/i18n/navigation";
import { formatDateShort } from "@/i18n/format";
import { StagePill } from "@/components/leads/stage-pill";
import { ContactColumn } from "@/components/leads/detail/contact-column";
import { SummaryColumn } from "@/components/leads/detail/summary-column";
import { NotesPanel } from "@/components/leads/detail/notes-panel";
import { ExternalRefsPanel } from "@/components/leads/detail/external-refs-panel";
import { StageTimeline } from "@/components/leads/detail/stage-timeline";
import { UpdateStageDialog } from "@/components/leads/detail/update-stage-dialog";
import { DeleteLeadButton } from "@/components/leads/detail/delete-lead-button";
import { InvoicesPanel } from "@/components/leads/detail/invoices-panel";

/**
 * Lead detail (docs/02 §2.5): three responsive columns — Contact + Capital,
 * Summary + Source + Notes, External data + Stage history. Server Component that
 * resolves the tenant context and fetches the lead (one batched query) plus the
 * tenant's lead sources / loss reasons for the inline selects.
 *
 * RBAC drives which controls render (server-authoritative; the actions re-check).
 */
export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ leadId: string }>;
}) {
  const { leadId } = await params;
  const t = await getTranslations("leadDetail");
  const tl = await getTranslations("leads");

  const ctx = await requireTenantContext();
  // Server-authoritative read guard (robust to future per-tenant permission
  // overrides); 404 avoids revealing the lead area cross-role.
  if (!can(ctx.role, "lead.view")) {
    notFound();
  }
  const deps = buildLeadDeps(ctx);

  // getLead throws NotFoundError for cross-tenant/deleted/missing ids → render
  // Next's 404 (never leaking whether the id exists in another tenant).
  let lead: LeadDetailRow;
  try {
    lead = await getLead(deps, leadId);
  } catch (error) {
    if (error instanceof NotFoundError) {
      notFound();
    }
    throw error;
  }

  const [sources, lossReasons] = await Promise.all([
    listLeadSources(deps),
    listLossReasons(deps),
  ]);

  const fullName = `${lead.firstName} ${lead.lastName}`;
  const initials = `${lead.firstName.charAt(0)}${lead.lastName.charAt(0)}`.toUpperCase();

  const perms = {
    canUpdate: can(ctx.role, "lead.update"),
    canSetCapital: can(ctx.role, "lead.setCapital"),
    canMove: can(ctx.role, "pipeline.move"),
    canNote: can(ctx.role, "lead.note"),
    canDelete: can(ctx.role, "lead.delete"),
    canInvoice: can(ctx.role, "invoice.create"),
  };

  // Invoices are only relevant for WON leads (docs/02 §2.2/§2.5) and only for
  // roles with the capability. Fetch them only then, so we never run the query —
  // nor render the panel — when it cannot apply (the "Aggiungi fattura" control
  // is disabled in the screenshots when not applicable).
  const showInvoices = perms.canInvoice && lead.stage === LeadStage.WON;
  const invoices = showInvoices
    ? (await listInvoices(buildInvoiceDeps(ctx), { leadId: lead.id })).data
    : [];

  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-4">
      <Link
        href="/leads"
        className="font-body text-[13px] text-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        ‹ {t("back")}
      </Link>

      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft font-body text-[15px] font-semibold text-accent-ink"
          >
            {initials}
          </span>
          <div className="flex flex-col gap-1">
            <h1>{fullName}</h1>
            <StagePill stage={lead.stage} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {perms.canMove ? (
            <UpdateStageDialog
              leadId={lead.id}
              currentStage={lead.stage}
              lossReasons={lossReasons}
            />
          ) : null}
          {perms.canDelete ? <DeleteLeadButton leadId={lead.id} /> : null}
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Left column: contact + capital */}
        <div className="flex flex-col gap-4">
          <ContactColumn
            leadId={lead.id}
            email={lead.email}
            phone={lead.phone}
            createdAt={await formatDateShort(lead.createdAt)}
            adminNotes={lead.adminNotes}
            capitalBracket={lead.capitalBracket}
            canSetCapital={perms.canSetCapital}
            canUpdate={perms.canUpdate}
          />
        </div>

        {/* Center column: summary + source + notes */}
        <div className="flex flex-col gap-4">
          <SummaryColumn
            leadId={lead.id}
            stage={lead.stage}
            stageDate={await formatDateShort(lead.stageChangedAt)}
            capitalBracket={lead.capitalBracket}
            sourceId={lead.sourceId}
            sources={sources}
            canUpdate={perms.canUpdate}
          />
          <NotesPanel
            leadId={lead.id}
            notes={lead.notes.map((n) => ({ id: n.id, body: n.body, createdAt: n.createdAt }))}
            canNote={perms.canNote}
          />
          {showInvoices ? <InvoicesPanel leadId={lead.id} invoices={invoices} /> : null}
        </div>

        {/* Right column: external refs + stage history */}
        <div className="flex flex-col gap-4">
          <ExternalRefsPanel
            leadId={lead.id}
            refs={lead.externalRefs}
            canNote={perms.canNote}
          />
          <Card>
            <CardBody className="flex flex-col gap-3">
              <h2 className="font-display text-lg text-ink">{t("timeline.title")}</h2>
              <StageTimeline history={lead.stageHistory} createdAt={lead.createdAt} />
            </CardBody>
          </Card>
        </div>
      </div>

      {/* Visually-hidden context so the page title is meaningful. */}
      <span className="sr-only">{tl("title")}</span>
    </div>
  );
}
