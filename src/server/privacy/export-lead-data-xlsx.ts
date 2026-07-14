import ExcelJS from "exceljs";

import type { PrivacyDeps } from "@/server/privacy/deps";
import {
  collectLeadDataForExport,
  type LeadDataExport,
} from "@/server/privacy/export-lead-data";

/**
 * GDPR EXPORT in Excel (.xlsx), for the lead detail "Esporta dati › Excel"
 * action (audit P0.2). Reuses the SAME tenant-scoped, minimized data collection
 * as the JSON export (`collectLeadDataForExport`) — there is exactly one query
 * and one minimization policy (docs/00 §1 DRY), so the two formats can never
 * expose different data. Only the SHAPE differs: one worksheet per data family.
 *
 * Layering: this is a use case (`server/`). It returns a raw buffer; the Server
 * Action base64-encodes it and the client builds the download Blob — no file is
 * ever written to disk server-side. RBAC + tenant context are enforced by the
 * action; ownership/isolation by the shared collector (foreign id → NotFound).
 *
 * Audit: written here with `format: "xlsx"` so the GDPR trail names the artefact
 * (docs/06 §6.4), carrying only counts — never the personal data itself.
 */

/** The result the Server Action serializes for the client to download. */
export interface LeadDataXlsxExport {
  readonly filename: string;
  readonly buffer: Buffer;
}

/** A worksheet definition: localized-agnostic header keys + typed rows. */
function buildWorkbook(data: LeadDataExport): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = "CustomerSpeed";
  wb.created = new Date(data.exportedAt);

  // ── Lead / anagrafica ──────────────────────────────────────────────────────
  // Key/value layout so a single subject reads top-to-bottom.
  const leadSheet = wb.addWorksheet("Lead");
  leadSheet.columns = [
    { header: "Campo", key: "field", width: 24 },
    { header: "Valore", key: "value", width: 48 },
  ];
  leadSheet.addRows([
    { field: "ID", value: data.subject.id },
    { field: "Nome", value: data.lead.firstName },
    { field: "Cognome", value: data.lead.lastName },
    { field: "Email", value: data.lead.email ?? "" },
    { field: "Telefono", value: data.lead.phone ?? "" },
    { field: "Stage", value: data.lead.stage },
    { field: "Capitale", value: data.lead.capitalBracket ?? "" },
    { field: "Provenienza", value: data.lead.source ?? "" },
    { field: "Motivo perdita", value: data.lead.lossReason ?? "" },
    { field: "Note interne", value: data.lead.adminNotes ?? "" },
    { field: "Creato il", value: data.lead.createdAt },
    { field: "Esportato il", value: data.exportedAt },
  ]);

  // ── Note ────────────────────────────────────────────────────────────────────
  const notesSheet = wb.addWorksheet("Note");
  notesSheet.columns = [
    { header: "Testo", key: "body", width: 60 },
    { header: "Creata il", key: "createdAt", width: 24 },
  ];
  notesSheet.addRows(data.notes.map((n) => ({ body: n.body, createdAt: n.createdAt })));

  // ── Appuntamenti ──────────────────────────────────────────────────────────
  const apptSheet = wb.addWorksheet("Appuntamenti");
  apptSheet.columns = [
    { header: "Motivo", key: "reason", width: 40 },
    { header: "Inizio", key: "startAt", width: 24 },
    { header: "Stato", key: "status", width: 16 },
  ];
  apptSheet.addRows(
    data.appointments.map((a) => ({ reason: a.reason, startAt: a.startAt, status: a.status })),
  );

  // ── Fatture ───────────────────────────────────────────────────────────────
  const invoiceSheet = wb.addWorksheet("Fatture");
  invoiceSheet.columns = [
    { header: "Numero", key: "number", width: 18 },
    { header: "Imponibile", key: "netAmount", width: 18 },
    { header: "Totale", key: "grossAmount", width: 18 },
    { header: "Emessa il", key: "issuedAt", width: 24 },
  ];
  // Amounts kept as strings to preserve Decimal precision (never float).
  invoiceSheet.addRows(
    data.invoices.map((i) => ({
      number: i.number ?? "",
      netAmount: i.netAmount,
      grossAmount: i.grossAmount,
      issuedAt: i.issuedAt,
    })),
  );

  // ── Riferimenti esterni ─────────────────────────────────────────────────────
  const refsSheet = wb.addWorksheet("Riferimenti esterni");
  refsSheet.columns = [
    { header: "Nome alternativo", key: "altName", width: 30 },
    { header: "Email alternativa", key: "altEmail", width: 30 },
    { header: "Sorgente", key: "source", width: 24 },
    { header: "Creato il", key: "createdAt", width: 24 },
  ];
  refsSheet.addRows(
    data.externalReferences.map((r) => ({
      altName: r.altName ?? "",
      altEmail: r.altEmail ?? "",
      source: r.source ?? "",
      createdAt: r.createdAt,
    })),
  );

  // ── Cronologia stage ────────────────────────────────────────────────────────
  const historySheet = wb.addWorksheet("Cronologia stage");
  historySheet.columns = [
    { header: "Da", key: "fromStage", width: 20 },
    { header: "A", key: "toStage", width: 20 },
    { header: "Cambiato il", key: "changedAt", width: 24 },
  ];
  historySheet.addRows(
    data.stageHistory.map((s) => ({
      fromStage: s.fromStage ?? "",
      toStage: s.toStage,
      changedAt: s.changedAt,
    })),
  );

  // Make the header row of every sheet bold (purely presentational).
  for (const sheet of wb.worksheets) {
    sheet.getRow(1).font = { bold: true };
  }

  return wb;
}

export async function exportLeadDataXlsx(
  deps: PrivacyDeps,
  leadId: string,
): Promise<LeadDataXlsxExport> {
  const data = await collectLeadDataForExport(deps, leadId);

  const workbook = buildWorkbook(data);
  // `writeBuffer` returns an ArrayBuffer-like; wrap in a Node Buffer for the
  // Server Action to base64-encode.
  const arrayBuffer = await workbook.xlsx.writeBuffer();
  const buffer = Buffer.from(arrayBuffer);

  await deps.audit.record({
    action: "gdpr.export",
    organizationId: deps.actor.organizationId,
    actorId: deps.actor.userId,
    entity: "Lead",
    entityId: data.subject.id,
    meta: {
      subject: "lead",
      format: "xlsx",
      counts: {
        notes: data.notes.length,
        appointments: data.appointments.length,
        invoices: data.invoices.length,
        externalReferences: data.externalReferences.length,
        stageHistory: data.stageHistory.length,
      },
    },
  });

  return { filename: `lead-${leadId}-export.xlsx`, buffer };
}
