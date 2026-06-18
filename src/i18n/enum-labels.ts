import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";

import {
  AppointmentStatus,
  CapitalBracket,
  LeadStage,
} from "@/generated/prisma/enums";

/**
 * Localized labels for the domain enums.
 *
 * The enum **values** live in the DB (and in the generated Prisma enums); their
 * human-readable **labels** live only in the i18n layer (`messages/*` under the
 * `enum.*` namespace) — never persisted, per docs/03 §3.2. This keeps labels
 * editable per locale without a migration and avoids duplicating copy in the DB.
 *
 * Only the three closed enums are mapped here. `LeadSource` and `LossReason`
 * are per-tenant configurable lists (their labels are tenant data in the DB),
 * so they are intentionally NOT handled here.
 *
 * Two flavours per enum, both fully typed on the enum value:
 * - `use<Enum>Label()` — for Client Components (hook).
 * - `get<Enum>Label()` — for Server Components / Server Actions (async).
 */

type LeadStageValue = (typeof LeadStage)[keyof typeof LeadStage];
type CapitalBracketValue = (typeof CapitalBracket)[keyof typeof CapitalBracket];
type AppointmentStatusValue =
  (typeof AppointmentStatus)[keyof typeof AppointmentStatus];

// --- Lead stage -----------------------------------------------------------

export function useLeadStageLabel(): (value: LeadStageValue) => string {
  const t = useTranslations("enum.leadStage");
  return (value) => t(value);
}

export async function getLeadStageLabel(
  value: LeadStageValue,
): Promise<string> {
  const t = await getTranslations("enum.leadStage");
  return t(value);
}

// --- Capital bracket ------------------------------------------------------

export function useCapitalBracketLabel(): (
  value: CapitalBracketValue,
) => string {
  const t = useTranslations("enum.capitalBracket");
  return (value) => t(value);
}

export async function getCapitalBracketLabel(
  value: CapitalBracketValue,
): Promise<string> {
  const t = await getTranslations("enum.capitalBracket");
  return t(value);
}

// --- Appointment status ---------------------------------------------------

export function useAppointmentStatusLabel(): (
  value: AppointmentStatusValue,
) => string {
  const t = useTranslations("enum.appointmentStatus");
  return (value) => t(value);
}

export async function getAppointmentStatusLabel(
  value: AppointmentStatusValue,
): Promise<string> {
  const t = await getTranslations("enum.appointmentStatus");
  return t(value);
}
