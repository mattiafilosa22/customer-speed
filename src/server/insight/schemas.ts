import { z } from "zod";

/**
 * Mese visualizzato. Stessi limiti di `periodSchema` (dashboard) per non
 * introdurre una seconda convenzione: anno 2000–2100, mese 1–12.
 */
export const monthSchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
});

export type MonthInput = z.infer<typeof monthSchema>;
