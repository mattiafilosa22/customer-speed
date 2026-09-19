/**
 * One-off, idempotent importer for the historical "Chat" worksheet.
 *
 * Required: DATABASE_URL, ORG_SLUG, FILE, ACTIVATION_DATE (YYYY-MM-DD).
 * Dry-run is the default. Set CONFIRM=yes to upsert archive days and persist
 * the activation boundary. Existing tenants only; this script never provisions.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import ExcelJS from "exceljs";

import { createClient } from "../prisma/seed-helpers";
import { parseChatSheet } from "../src/server/insight/import-history";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} must be set.`);
  return value;
}

function cellValue(value: ExcelJS.CellValue): unknown {
  if (value && typeof value === "object" && "result" in value) return value.result;
  if (value && typeof value === "object" && "richText" in value) {
    return value.richText.map((part) => part.text).join("");
  }
  return value;
}

function reportText(params: {
  organization: string;
  activationDate: string;
  imported: number;
  excluded: number;
  report: ReturnType<typeof parseChatSheet>;
}): string {
  const lines = [
    `Organization: ${params.organization}`,
    `Activation date: ${params.activationDate}`,
    `Archive days eligible: ${params.imported}`,
    `Days excluded at/after activation: ${params.excluded}`,
    `Anomalies: ${params.report.anomalies.length}`,
    "",
    "Monthly totals:",
    ...Object.entries(params.report.monthlyTotals).map(
      ([month, totals]) => `${month}: ${JSON.stringify(totals)}`,
    ),
    "",
    "Anomalies:",
    ...params.report.anomalies.map(
      (entry) => `row ${entry.row}, column ${entry.column}, ${entry.kind}: ${entry.value}`,
    ),
  ];
  return `${lines.join("\n")}\n`;
}

async function main(): Promise<void> {
  const orgSlug = required("ORG_SLUG").toLowerCase();
  const filename = required("FILE");
  const activationDate = required("ACTIVATION_DATE");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(activationDate)) {
    throw new Error("ACTIVATION_DATE must be YYYY-MM-DD.");
  }
  const activation = new Date(`${activationDate}T00:00:00.000Z`);
  if (Number.isNaN(activation.getTime())) throw new Error("ACTIVATION_DATE is invalid.");

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filename);
  const sheet = workbook.getWorksheet("Chat");
  if (!sheet) throw new Error('Worksheet "Chat" was not found.');
  const rows: unknown[][] = [];
  sheet.eachRow({ includeEmpty: true }, (row) => {
    rows.push(Array.from({ length: 12 }, (_, index) => cellValue(row.getCell(index + 1).value)));
  });
  const report = parseChatSheet(rows);
  const eligible = report.days.filter((day) => day.date < activationDate);
  const excluded = report.days.length - eligible.length;

  const prisma = createClient();
  try {
    const organization = await prisma.organization.findUnique({
      where: { slug: orgSlug },
      select: { id: true, name: true },
    });
    if (!organization) {
      throw new Error(`No organization with slug "${orgSlug}" — refusing to create one.`);
    }
    const text = reportText({
      organization: organization.name,
      activationDate,
      imported: eligible.length,
      excluded,
      report,
    });
    console.info(text);

    if (process.env.CONFIRM !== "yes") {
      console.info("Dry run only. Set CONFIRM=yes to write the archive.");
      return;
    }

    await prisma.$transaction(async (tx) => {
      for (const day of eligible) {
        const date = new Date(`${day.date}T00:00:00.000Z`);
        const data = {
          welcomeSent: day.welcomeSent,
          welcomeReplies: day.welcomeReplies,
          outboundComments: 0,
          outboundStories: 0,
          outboundReplies: day.outboundReplies,
          inboundReceived: day.inboundReceived,
          isArchived: true,
          archivedOutboundMessages: day.outboundMessages,
          archivedWelcomeAppointments: day.welcomeAppointments,
          archivedWelcomeSales: day.welcomeSales,
          archivedOutboundAppointments: day.outboundAppointments,
          archivedOutboundSales: day.outboundSales,
          archivedInboundAppointments: day.inboundAppointments,
          archivedInboundSales: day.inboundSales,
        };
        await tx.chatActivityDay.upsert({
          where: { organizationId_date: { organizationId: organization.id, date } },
          create: { organizationId: organization.id, date, ...data },
          update: data,
        });
      }
      await tx.organization.update({
        where: { id: organization.id },
        data: { insightActiveFrom: activation },
      });
    });

    const backupsDir = path.resolve("backups");
    await mkdir(backupsDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const reportPath = path.join(backupsDir, `insight-import-${stamp}.txt`);
    await writeFile(reportPath, text, "utf8");
    console.info(`Imported ${eligible.length} archive days. Report: ${reportPath}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error("Insight history import failed:", error);
  process.exitCode = 1;
});
