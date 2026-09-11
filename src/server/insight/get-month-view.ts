/** Counts shared by each derived channel in the month view. */
export interface ChannelDayCounts {
  readonly appointments: number;
  readonly appointmentsFromInsight: number;
  readonly sales: number;
  readonly salesFromInsight: number;
}

/** Public shape of one calendar day; assembled by Task 8. */
export interface MonthDayRow {
  readonly date: string;
  readonly isArchived: boolean;
  readonly isFuture: boolean;
  readonly welcome: ChannelDayCounts & { readonly sent: number; readonly replies: number };
  readonly outbound: ChannelDayCounts & {
    readonly comments: number;
    readonly stories: number;
    readonly archivedMessages: number | null;
    readonly replies: number;
  };
  readonly inbound: ChannelDayCounts & { readonly received: number };
  readonly totalAppointments: number;
  readonly totalSales: number;
}
