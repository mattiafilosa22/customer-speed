/**
 * Public surface of the appointment domain module. The Server Actions and the
 * RSC pages import these use cases; they never reach into Prisma directly
 * (docs/00 §1).
 */
export type { AppointmentActor, AppointmentDeps } from "@/server/appointments/deps";
export { buildAppointmentDeps } from "@/server/appointments/context-deps";

export {
  createAppointment,
  type CreateAppointmentResult,
} from "@/server/appointments/create-appointment";
export {
  updateAppointment,
  type UpdateAppointmentResult,
} from "@/server/appointments/update-appointment";
export {
  changeAppointmentStatus,
  type ChangeAppointmentStatusResult,
} from "@/server/appointments/change-status";
export {
  deleteAppointment,
  type DeleteAppointmentResult,
} from "@/server/appointments/delete-appointment";
export { getAppointment } from "@/server/appointments/get-appointment";
export {
  listAppointments,
  type AppointmentItem,
  type AppointmentListResult,
  type AppointmentTabCounts,
} from "@/server/appointments/list-appointments";
export {
  getAppointmentsForMonth,
  type MonthAppointmentDay,
  type MonthAppointmentsResult,
} from "@/server/appointments/get-appointments-for-month";

export {
  APPOINTMENT_FILTERS,
  type AppointmentFilter,
  createAppointmentSchema,
  type CreateAppointmentInput,
  listAppointmentsSchema,
} from "@/server/appointments/schemas";

export type { AppointmentListRow } from "@/server/appointments/selectors";
