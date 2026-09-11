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

const counter = z.coerce.number().int().min(0).max(100_000);

export const saveActivityDaySchema = z
  .object({
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD")
      .transform((day) => new Date(`${day}T00:00:00.000Z`)),
    welcomeSent: counter,
    welcomeReplies: counter,
    outboundComments: counter,
    outboundStories: counter,
    outboundReplies: counter,
    inboundReceived: counter,
  })
  .refine((counters) => counters.welcomeReplies <= counters.welcomeSent, {
    path: ["welcomeReplies"],
    message: "insight.errors.repliesExceedWelcome",
  })
  .refine(
    (counters) =>
      counters.outboundReplies <= counters.outboundComments + counters.outboundStories,
    {
      path: ["outboundReplies"],
      message: "insight.errors.repliesExceedOutbound",
    },
  );

export type SaveActivityDayInput = z.infer<typeof saveActivityDaySchema>;
