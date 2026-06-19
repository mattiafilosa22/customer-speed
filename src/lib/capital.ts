import { Prisma } from "@/generated/prisma/client";
import { CapitalBracket } from "@/generated/prisma/enums";

/**
 * Capital amount → bracket derivation (docs/03 §3.2).
 *
 * When a lead's capital is entered as an EXACT amount (€), the coarse-grained
 * `CapitalBracket` is derived from it server-side and persisted alongside, so
 * every dashboard/filter/grouping that reasons over the bracket keeps working.
 * The client is never trusted for the bracket when an amount is present.
 *
 * Boundaries are SEMI-OPEN — `[lower, upper)` — in euros:
 *   [0,        50_000)    → B_0_50K
 *   [50_000,   100_000)   → B_50_100K
 *   [100_000,  250_000)   → B_100_250K
 *   [250_000,  500_000)   → B_250_500K
 *   [500_000,  1_000_000) → B_500K_1M
 *   [1_000_000, ∞)        → B_OVER_1M
 *
 * So an integer boundary (e.g. exactly 50 000) belongs to the UPPER band.
 */

/** Upper-exclusive thresholds (€), paired with the bracket BELOW the threshold. */
const BRACKET_THRESHOLDS: ReadonlyArray<readonly [maxExclusive: number, bracket: CapitalBracket]> = [
  [50_000, CapitalBracket.B_0_50K],
  [100_000, CapitalBracket.B_50_100K],
  [250_000, CapitalBracket.B_100_250K],
  [500_000, CapitalBracket.B_250_500K],
  [1_000_000, CapitalBracket.B_500K_1M],
];

/** The catch-all band for amounts ≥ the highest threshold. */
const TOP_BRACKET = CapitalBracket.B_OVER_1M;

/**
 * Normalize an amount (number | Decimal | numeric string) to a finite,
 * cent-rounded number. Throws on non-finite / unparsable input so callers fail
 * loudly rather than mis-classify. Rounding to cents (the column's precision)
 * keeps integer boundaries exact and avoids float drift on the comparison.
 */
function toCents(amount: number | Prisma.Decimal | string): number {
  const value =
    amount instanceof Prisma.Decimal
      ? amount.toNumber()
      : typeof amount === "string"
        ? Number(amount)
        : amount;
  if (!Number.isFinite(value)) {
    throw new RangeError(`Invalid capital amount: ${String(amount)}`);
  }
  // Compare on integer cents so e.g. 49_999.99 < 50_000 holds without 1e-?? drift.
  return Math.round(value * 100);
}

/**
 * Derive the `CapitalBracket` an exact amount falls into. Negative amounts are
 * rejected (validated upstream too); the comparison runs on integer cents so the
 * semi-open boundaries are exact at integer euros.
 */
export function bracketFromAmount(amount: number | Prisma.Decimal | string): CapitalBracket {
  const cents = toCents(amount);
  if (cents < 0) {
    throw new RangeError(`Capital amount cannot be negative: ${String(amount)}`);
  }
  for (const [maxExclusive, bracket] of BRACKET_THRESHOLDS) {
    if (cents < maxExclusive * 100) {
      return bracket;
    }
  }
  return TOP_BRACKET;
}

/** The canonical pair persisted on a lead: amount (€) + the bracket it maps to. */
export interface ResolvedCapital {
  readonly capitalAmount: number | null;
  readonly capitalBracket: CapitalBracket | null;
}

/**
 * Single source of truth for the "exact amount OR bracket" rule (docs/02 §2.4),
 * applied by every use case that writes capital so the behaviour is identical
 * everywhere:
 *  - an EXACT amount wins → the bracket is DERIVED from it (client bracket
 *    ignored), both are stored;
 *  - otherwise a bracket alone is stored and the amount cleared;
 *  - both empty → both cleared.
 *
 * `undefined` for BOTH inputs means "capital not touched by this request" and
 * yields `undefined` so partial updates leave the columns alone.
 */
export function resolveCapital(input: {
  capitalAmount?: number | null;
  capitalBracket?: CapitalBracket | null;
}): ResolvedCapital | undefined {
  const { capitalAmount, capitalBracket } = input;
  if (capitalAmount === undefined && capitalBracket === undefined) {
    return undefined;
  }
  if (capitalAmount !== undefined && capitalAmount !== null) {
    // Exact amount provided → derive + store both (bracket from client ignored).
    return { capitalAmount, capitalBracket: bracketFromAmount(capitalAmount) };
  }
  if (capitalBracket !== undefined && capitalBracket !== null) {
    // Bracket chosen → store it, clear the exact amount.
    return { capitalAmount: null, capitalBracket };
  }
  // Both explicitly empty → clear capital entirely.
  return { capitalAmount: null, capitalBracket: null };
}
