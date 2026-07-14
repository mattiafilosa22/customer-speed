/** One tenant loss reason, as returned by every use case in this module. */
export interface LossReasonItem {
  readonly id: string;
  readonly label: string;
  readonly isActive: boolean;
  readonly sortOrder: number;
}
