"use client";

import { AppointmentStatus } from "@/generated/prisma/enums";
import { Pill, type PillTone } from "@/components/ui";
import { useAppointmentStatusLabel } from "@/i18n/enum-labels";

/**
 * Status pill for an appointment (docs/02 §2.6). The status is conveyed by TEXT
 * (the localized enum label) AND a semantic tone — never colour alone (WCAG
 * 1.4.1). Tone mapping: PENDING = warn (to do), DONE = ok, CANCELED = exec.
 */
const TONE_BY_STATUS: Readonly<Record<AppointmentStatus, PillTone>> = {
  [AppointmentStatus.PENDING]: "warn",
  [AppointmentStatus.DONE]: "ok",
  [AppointmentStatus.CANCELED]: "exec",
};

export function AppointmentStatusPill({ status }: { status: AppointmentStatus }) {
  const label = useAppointmentStatusLabel();
  return <Pill tone={TONE_BY_STATUS[status]}>{label(status)}</Pill>;
}
