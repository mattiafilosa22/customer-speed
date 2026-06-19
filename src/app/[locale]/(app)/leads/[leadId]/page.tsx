import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { NotFoundError } from "@/lib/errors";
import { requireTenantContext } from "@/lib/tenant";
import { can } from "@/lib/rbac";
import { daysInStage } from "@/lib/days";
import { LeadStage } from "@/generated/prisma/enums";
import type { LeadDetailRow } from "@/server/leads";
import {
  buildLeadDeps,
  getLead,
  listLeadSources,
  listLossReasons,
} from "@/server/leads";
import { buildInvoiceDeps, listInvoices } from "@/server/invoices";
import { buildAppointmentDeps, listAppointments } from "@/server/appointments";
import { getTenantFeatureFlags } from "@/server/tenant/feature-flags";
import { Link } from "@/i18n/navigation";
import { formatDateShort } from "@/i18n/format";
import { StagePill } from "@/components/leads/stage-pill";
import { LeadSummary } from "@/components/leads/detail/lead-summary";
import { ContactColumn } from "@/components/leads/detail/contact-column";
import { LeadDetails } from "@/components/leads/detail/lead-details";
import { NotesPanel } from "@/components/leads/detail/notes-panel";
import { ExternalRefsPanel } from "@/components/leads/detail/external-refs-panel";
import { StageTimeline } from "@/components/leads/detail/stage-timeline";
import { UpdateStageDialog } from "@/components/leads/detail/update-stage-dialog";
import { LeadOverflowActions } from "@/components/leads/detail/lead-overflow-actions";
import { InvoicesPanel } from "@/components/leads/detail/invoices-panel";
import { AppointmentsPanel } from "@/components/leads/detail/appointments-panel";

/**
 * Lead detail (docs/02 §2.5). Layout "Note colonna centrale Attività":
 *  - header (avatar + name + stage pill + primary/overflow actions),
 *  - "Sintesi" read-only key-fact strip (stage + days, capital, source, created),
 *  - main/central column (the activity stream — most prominent): Notes first
 *    ("diario attività" pattern), then Appointments, then Invoices (if WON),
 *  - side/reference column: Contact, Dettagli lead (capital + source editors),
 *    Aggiornamento dati (external refs), Stage history.
 *
 * The main column comes FIRST in the DOM so that, when the grid collapses to a
 * single column on mobile/tablet, Notes land at the top right under "Sintesi".
 *
 * No fact is duplicated as an editor + a display in the same place: the summary
 * is read-only; the editable capital/source live once in "Dettagli lead".
 *
 * Server Component that resolves the tenant context and fetches the lead (one
 * batched query) plus the tenant's lead sources / loss reasons for the inline
 * selects. RBAC drives which controls render (server-authoritative; the actions
 * re-check).
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
  // Decimal → number at the RSC boundary (Decimal is not serializable to client
  // components); precision is bounded by the column's @db.Decimal(14,2).
  const capitalAmount = lead.capitalAmount === null ? null : lead.capitalAmount.toNumber();

  const perms = {
    canUpdate: can(ctx.role, "lead.update"),
    canSetCapital: can(ctx.role, "lead.setCapital"),
    canMove: can(ctx.role, "pipeline.move"),
    canNote: can(ctx.role, "lead.note"),
    canDelete: can(ctx.role, "lead.delete"),
    canInvoice: can(ctx.role, "invoice.create"),
    canManageAppointments: can(ctx.role, "appointment.manage"),
    canExportData: can(ctx.role, "lead.exportData"),
    canEraseData: can(ctx.role, "lead.eraseData"),
  };

  // Invoices are only relevant for WON leads (docs/02 §2.2/§2.5) and only for
  // roles with the capability. Fetch them only then, so we never run the query —
  // nor render the panel — when it cannot apply (the "Aggiungi fattura" control
  // is disabled in the screenshots when not applicable).
  const showInvoices = perms.canInvoice && lead.stage === LeadStage.WON;
  const invoices = showInvoices
    ? (await listInvoices(buildInvoiceDeps(ctx), { leadId: lead.id })).data
    : [];

  // Appointments panel (docs/02 §2.5 right column): only when the tenant has the
  // `appointments` feature AND the role can manage them. Fetch the lead's
  // appointments tenant-scoped via the dedicated use case (one batched query).
  const flags = await getTenantFeatureFlags(ctx.organizationId);
  const showAppointments = flags.appointments && perms.canManageAppointments;
  const appointments = showAppointments
    ? (
        await listAppointments(buildAppointmentDeps(ctx), {
          filter: "all",
          leadId: lead.id,
        })
      ).data
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
        {/* One primary button ("Aggiorna stage"); everything else lives behind
            the "⋯" overflow menu (audit P0.1) so the header reads cleanly and
            destructive actions never collide with the accent primary. */}
        <div className="flex flex-wrap items-center gap-2">
          {perms.canMove ? (
            <UpdateStageDialog
              leadId={lead.id}
              currentStage={lead.stage}
              lossReasons={lossReasons}
            />
          ) : null}
          <LeadOverflowActions
            leadId={lead.id}
            canExport={perms.canExportData}
            canErase={perms.canEraseData}
            canDelete={perms.canDelete}
          />
        </div>
      </header>

      {/* Sintesi: read-only key-facts at a glance, under the header. */}
      <LeadSummary
        stage={lead.stage}
        daysInStage={daysInStage(lead.stageChangedAt)}
        capitalBracket={lead.capitalBracket}
        capitalAmount={capitalAmount}
        source={lead.source}
        createdAt={await formatDateShort(lead.createdAt)}
      />

      {/* Two columns on desktop (main/central wider), stacked on mobile/tablet.
          The main column is declared FIRST so it stacks above the reference
          column on mobile → Notes sit right under "Sintesi". */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.6fr_1fr]">
        {/* Main/central column: the activity stream — Notes, Appointments,
            Invoices (if WON). Notes are the most prominent block. */}
        <div className="flex flex-col gap-4">
          <NotesPanel
            leadId={lead.id}
            notes={lead.notes.map((n) => ({ id: n.id, body: n.body, createdAt: n.createdAt }))}
            canNote={perms.canNote}
          />
          {showAppointments ? (
            <AppointmentsPanel leadId={lead.id} appointments={appointments} />
          ) : null}
          {showInvoices ? <InvoicesPanel leadId={lead.id} invoices={invoices} /> : null}
        </div>

        {/* Side/reference column: contact + lead details (editors) + external
            refs + stage history. */}
        <div className="flex flex-col gap-4">
          <ContactColumn email={lead.email} phone={lead.phone} adminNotes={lead.adminNotes} />
          <LeadDetails
            leadId={lead.id}
            capitalBracket={lead.capitalBracket}
            capitalAmount={capitalAmount}
            canSetCapital={perms.canSetCapital}
            sourceId={lead.sourceId}
            sources={sources}
            canUpdate={perms.canUpdate}
          />
          <ExternalRefsPanel
            leadId={lead.id}
            refs={lead.externalRefs}
            canNote={perms.canNote}
          />
          {/* StageTimeline renders its own Card + heading — no outer wrapper, so
              there is a single "Cronologia stage" title (audit P1.2). */}
          <StageTimeline history={lead.stageHistory} createdAt={lead.createdAt} />
        </div>
      </div>

      {/* Visually-hidden context so the page title is meaningful. */}
      <span className="sr-only">{tl("title")}</span>
    </div>
  );
}
