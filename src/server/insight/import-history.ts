import type { ColumnTotals } from "@/server/insight/totals";

/**
 * Parser puro per il foglio storico "Chat" (docs/superpowers/specs/2026-09-10-insight-stats-design.md
 * §Import dello storico). Nessun I/O qui: lo script `scripts/import-insight-history.ts` legge
 * l'xlsx con ExcelJS e passa a `parseChatSheet` la matrice di celle già estratta.
 *
 * Mappa colonne del foglio (indici 0-based nella riga, colonna A = data):
 *
 * | Colonna | Indice riga | Destinazione                          |
 * |---------|-------------|----------------------------------------|
 * | A       | 0           | `date`                                  |
 * | B       | 1           | `welcomeSent`                           |
 * | C       | 2           | `welcomeReplies`                        |
 * | D       | 3           | `welcomeAppointments` (congelato)       |
 * | E       | 4           | `welcomeSales` (congelato)              |
 * | F       | 5           | `outboundMessages` (aggregato, non separabile in commenti/storie) |
 * | G       | 6           | `outboundReplies`                       |
 * | H       | 7           | `outboundAppointments` (congelato)      |
 * | I       | 8           | `outboundSales` (congelato)             |
 * | J       | 9           | `inboundReceived`                       |
 * | K       | 10          | `inboundAppointments` (congelato)       |
 * | L       | 11          | `inboundSales` (congelato)              |
 *
 * Colonne M/N (totali) non si leggono mai: i totali si ricalcolano dai giorni
 * validi, così i difetti noti del foglio (riga TOT di giugno 2025 con
 * percentuali, formule M mancanti su 5 righe, off-by-one di N509) non entrano
 * nell'archivio.
 */

type Mutable<T> = { -readonly [Key in keyof T]: T[Key] };

export interface ImportedDay {
  readonly date: string;
  readonly welcomeSent: number;
  readonly welcomeReplies: number;
  readonly welcomeAppointments: number;
  readonly welcomeSales: number;
  readonly outboundMessages: number;
  readonly outboundReplies: number;
  readonly outboundAppointments: number;
  readonly outboundSales: number;
  readonly inboundReceived: number;
  readonly inboundAppointments: number;
  readonly inboundSales: number;
}

/**
 * Una cella o riga che il parser non ha potuto fidarsi ciecamente. `row` è
 * 1-based e riflette la posizione nell'array passato a `parseChatSheet`
 * (stessa numerazione dei fogli Excel se si passa una riga per riga letta).
 * L'anomalia non blocca l'import: il valore incoerente viene comunque
 * riportato (repliesExceedMessages) o azzerato (nonNumeric/negative) senza
 * perdere il resto del giorno.
 */
export interface ImportAnomaly {
  readonly row: number;
  readonly column: string;
  readonly kind: "nonNumeric" | "negative" | "repliesExceedMessages" | "duplicateDate";
  readonly value: string;
}

export interface ImportReport {
  readonly days: ImportedDay[];
  readonly anomalies: ImportAnomaly[];
  readonly monthlyTotals: Record<string, ColumnTotals>;
}

const COLUMNS = ["B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"] as const;

function zeroTotals(): ColumnTotals {
  return {
    welcomeSent: 0,
    welcomeReplies: 0,
    welcomeAppointments: 0,
    welcomeSales: 0,
    outboundMessages: 0,
    outboundReplies: 0,
    outboundAppointments: 0,
    outboundSales: 0,
    inboundReceived: 0,
    inboundAppointments: 0,
    inboundSales: 0,
    totalAppointments: 0,
    totalSales: 0,
  };
}

function dateKey(value: unknown): string | null {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return null;
  return value.toISOString().slice(0, 10);
}

/**
 * Estrae i giorni validi dal foglio "Chat" e ricalcola i totali mensili dai
 * dati letti — mai dalle righe `TOT`/tassi del foglio, che nel file reale sono
 * inconsistenti (spec §Difetti del foglio).
 *
 * Regole:
 * - **Riga giornaliera** = solo quella la cui colonna A è una `Date` valida;
 *   righe `TOT`, righe di tassi, intestazioni e righe vuote vengono ignorate
 *   perché non superano questo controllo (nessuna lista di esclusione da
 *   mantenere).
 * - **Cella non numerica** → scartata singolarmente (valore 0, anomalia
 *   `nonNumeric`), senza perdere le altre celle valide dello stesso giorno.
 * - **Valore negativo** → azzerato, anomalia `negative`.
 * - **Risposte > messaggi** (welcome o outbound) → il valore letto viene
 *   comunque importato così com'è, ma segnalato con `repliesExceedMessages`:
 *   il dato storico non si inventa, la validazione stretta vale solo dal
 *   periodo vivo in poi.
 * - **Data duplicata** → si tiene la prima occorrenza, la seconda viene
 *   scartata e segnalata con `duplicateDate`.
 */
export function parseChatSheet(rows: readonly (readonly unknown[])[]): ImportReport {
  const days: ImportedDay[] = [];
  const anomalies: ImportAnomaly[] = [];
  const seen = new Set<string>();

  rows.forEach((row, index) => {
    const date = dateKey(row[0]);
    if (!date) return;
    if (seen.has(date)) {
      anomalies.push({ row: index + 1, column: "A", kind: "duplicateDate", value: date });
      return;
    }
    seen.add(date);

    const values = COLUMNS.map((column, valueIndex) => {
      const value = row[valueIndex + 1];
      if (value === null || value === undefined || value === "") return 0;
      if (typeof value !== "number" || !Number.isFinite(value)) {
        anomalies.push({ row: index + 1, column, kind: "nonNumeric", value: String(value) });
        return 0;
      }
      if (value < 0) {
        anomalies.push({ row: index + 1, column, kind: "negative", value: String(value) });
        return 0;
      }
      return Math.trunc(value);
    });

    const day: ImportedDay = {
      date,
      welcomeSent: values[0]!,
      welcomeReplies: values[1]!,
      welcomeAppointments: values[2]!,
      welcomeSales: values[3]!,
      outboundMessages: values[4]!,
      outboundReplies: values[5]!,
      outboundAppointments: values[6]!,
      outboundSales: values[7]!,
      inboundReceived: values[8]!,
      inboundAppointments: values[9]!,
      inboundSales: values[10]!,
    };
    if (day.welcomeReplies > day.welcomeSent) {
      anomalies.push({
        row: index + 1,
        column: "C",
        kind: "repliesExceedMessages",
        value: String(day.welcomeReplies),
      });
    }
    if (day.outboundReplies > day.outboundMessages) {
      anomalies.push({
        row: index + 1,
        column: "G",
        kind: "repliesExceedMessages",
        value: String(day.outboundReplies),
      });
    }
    days.push(day);
  });

  const monthlyTotals: Record<string, ColumnTotals> = {};
  for (const day of days) {
    const month = day.date.slice(0, 7);
    const totals = (monthlyTotals[month] ?? zeroTotals()) as Mutable<ColumnTotals>;
    totals.welcomeSent += day.welcomeSent;
    totals.welcomeReplies += day.welcomeReplies;
    totals.welcomeAppointments += day.welcomeAppointments;
    totals.welcomeSales += day.welcomeSales;
    totals.outboundMessages += day.outboundMessages;
    totals.outboundReplies += day.outboundReplies;
    totals.outboundAppointments += day.outboundAppointments;
    totals.outboundSales += day.outboundSales;
    totals.inboundReceived += day.inboundReceived;
    totals.inboundAppointments += day.inboundAppointments;
    totals.inboundSales += day.inboundSales;
    totals.totalAppointments +=
      day.welcomeAppointments + day.outboundAppointments + day.inboundAppointments;
    totals.totalSales += day.welcomeSales + day.outboundSales + day.inboundSales;
    monthlyTotals[month] = totals;
  }

  return { days, anomalies, monthlyTotals };
}
