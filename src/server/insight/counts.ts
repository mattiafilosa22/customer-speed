import type { ChannelGroup } from "@/server/insight/channels";

/**
 * Valore di una cella calcolata. `fromInsight` è il sottoinsieme creato
 * cliccando la tabella: alimenta il tooltip "8 creati da qui, 2 inseriti da
 * lista lead o pipeline".
 */
export interface DerivedCount {
  readonly total: number;
  readonly fromInsight: number;
}

export const ZERO_COUNT: DerivedCount = { total: 0, fromInsight: 0 };

export function emptyCountsByGroup(): Record<ChannelGroup, DerivedCount> {
  return {
    welcome: { ...ZERO_COUNT },
    outbound: { ...ZERO_COUNT },
    inbound: { ...ZERO_COUNT },
  };
}

/** Chiave giorno `YYYY-MM-DD` in UTC — stessa convenzione di docs/00 §3. */
export function utcDayKey(instant: Date): string {
  return instant.toISOString().slice(0, 10);
}
