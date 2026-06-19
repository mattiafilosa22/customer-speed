import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { NotFoundError } from "@/lib/errors";
import { exportLeadDataXlsx } from "@/server/privacy/export-lead-data-xlsx";
import { buildExportFake, PrivacyStore } from "@/server/privacy/test-helpers";

const ORG_A = "org_a";
const ORG_B = "org_b";

function seed(): { store: PrivacyStore; leadAId: string } {
  const store = new PrivacyStore();
  const src = store.addSource({ organizationId: ORG_A, label: "Instagram" });
  const leadA = store.addLead({
    organizationId: ORG_A,
    firstName: "Mario",
    lastName: "Rossi",
    email: "mario@example.com",
    phone: "+39111",
    sourceId: src.id,
    adminNotes: "VIP",
  });
  store.addNote({ organizationId: ORG_A, leadId: leadA.id, body: "Prima nota" });
  store.addNote({ organizationId: ORG_A, leadId: leadA.id, body: "Seconda nota" });
  store.addRef({ organizationId: ORG_A, leadId: leadA.id, altName: "M. Rossi" });
  store.addAppt({ organizationId: ORG_A, leadId: leadA.id, reason: "Call iniziale" });
  store.addInvoice({ organizationId: ORG_A, leadId: leadA.id });
  store.addStageHist({ organizationId: ORG_A, leadId: leadA.id, toStage: "WON" });

  // Another tenant's lead with the SAME-looking data (isolation control).
  const leadB = store.addLead({ organizationId: ORG_B, firstName: "Other", lastName: "Tenant" });
  store.addNote({ organizationId: ORG_B, leadId: leadB.id, body: "B note (must never appear)" });

  return { store, leadAId: leadA.id };
}

/**
 * Re-read a generated .xlsx buffer back into a workbook (round-trip check).
 * exceljs's `load` is typed against an ArrayBuffer-like (its own ambient
 * `Buffer`), so we hand it the Node Buffer's underlying ArrayBuffer view.
 */
async function readBack(buffer: Buffer): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  // Copy the bytes into a fresh, plain ArrayBuffer (exceljs's `load` is typed
  // against an ArrayBuffer-like — never a SharedArrayBuffer).
  const copy = new ArrayBuffer(buffer.byteLength);
  new Uint8Array(copy).set(buffer);
  await wb.xlsx.load(copy);
  return wb;
}

describe("exportLeadDataXlsx", () => {
  it("happy path: produces an .xlsx with the expected sheets and rows", async () => {
    const { store, leadAId } = seed();
    const { deps } = buildExportFake(store, ORG_A);

    const result = await exportLeadDataXlsx(deps, leadAId);

    expect(result.filename).toBe(`lead-${leadAId}-export.xlsx`);
    expect(result.buffer.length).toBeGreaterThan(0);

    const wb = await readBack(result.buffer);
    const sheetNames = wb.worksheets.map((s) => s.name);
    expect(sheetNames).toEqual([
      "Lead",
      "Note",
      "Appuntamenti",
      "Fatture",
      "Riferimenti esterni",
      "Cronologia stage",
    ]);

    // Note: exceljs does NOT persist column `key`s in the file, so on read-back
    // we address columns by their 1-based position (the order we defined).

    // Lead sheet: key/value rows incl. the identity (header row is #1; col 2 = value).
    const leadSheet = wb.getWorksheet("Lead")!;
    const leadValues = leadSheet
      .getColumn(2)
      .values.filter((v): v is string => typeof v === "string");
    expect(leadValues).toContain("Mario");
    expect(leadValues).toContain("mario@example.com");
    expect(leadValues).toContain("Instagram");

    // Note sheet: 2 data rows under the header (col 1 = body).
    const notesSheet = wb.getWorksheet("Note")!;
    expect(notesSheet.actualRowCount).toBe(3); // header + 2 notes
    const noteBodies = notesSheet
      .getColumn(1)
      .values.filter((v): v is string => typeof v === "string");
    expect(noteBodies).toEqual(expect.arrayContaining(["Prima nota", "Seconda nota"]));

    // One appointment, one invoice, one external ref, one stage-history row.
    expect(wb.getWorksheet("Appuntamenti")!.actualRowCount).toBe(2);
    expect(wb.getWorksheet("Fatture")!.actualRowCount).toBe(2);
    expect(wb.getWorksheet("Riferimenti esterni")!.actualRowCount).toBe(2);
    expect(wb.getWorksheet("Cronologia stage")!.actualRowCount).toBe(2);

    // Invoice amounts preserved as the exact Decimal string (col 2 = netAmount).
    const invoiceSheet = wb.getWorksheet("Fatture")!;
    const netValues = invoiceSheet.getColumn(2).values.map((v) => String(v));
    expect(netValues).toContain("1000");
  });

  it("minimization: never includes another tenant's data", async () => {
    const { store, leadAId } = seed();
    const { deps } = buildExportFake(store, ORG_A);
    const result = await exportLeadDataXlsx(deps, leadAId);

    const wb = await readBack(result.buffer);
    const serialized = JSON.stringify(
      wb.worksheets.flatMap((s) => s.getSheetValues()),
    );
    expect(serialized).not.toContain("B note");
    expect(serialized).not.toContain("Other");
  });

  it("isolation: a lead from another tenant is NotFound (non-revealing)", async () => {
    const { store } = seed();
    const leadB = store.leads.find((l) => l.organizationId === ORG_B);
    const { deps } = buildExportFake(store, ORG_A);
    await expect(exportLeadDataXlsx(deps, leadB!.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("missing lead → NotFound", async () => {
    const { store } = seed();
    const { deps } = buildExportFake(store, ORG_A);
    await expect(exportLeadDataXlsx(deps, "does_not_exist")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("writes an audit record (proof) with format=xlsx and only counts (no PII)", async () => {
    const { store, leadAId } = seed();
    const { deps, audits } = buildExportFake(store, ORG_A, "actor_1");
    await exportLeadDataXlsx(deps, leadAId);

    expect(audits).toHaveLength(1);
    const event = audits[0]!;
    expect(event.action).toBe("gdpr.export");
    expect(event.organizationId).toBe(ORG_A);
    expect(event.actorId).toBe("actor_1");
    expect(event.entity).toBe("Lead");
    expect(event.entityId).toBe(leadAId);
    const meta = JSON.stringify(event.meta);
    expect(meta).toContain("xlsx");
    expect(meta).toContain("counts");
    expect(meta).not.toContain("mario@example.com");
  });
});
