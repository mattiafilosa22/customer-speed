import { describe, expect, it } from "vitest";

import { Prisma } from "@/generated/prisma/client";
import { CapitalBracket } from "@/generated/prisma/enums";
import { bracketFromAmount, resolveCapital } from "@/lib/capital";

describe("bracketFromAmount", () => {
  it("classifies values inside each band", () => {
    expect(bracketFromAmount(0)).toBe(CapitalBracket.B_0_50K);
    expect(bracketFromAmount(25_000)).toBe(CapitalBracket.B_0_50K);
    expect(bracketFromAmount(75_000)).toBe(CapitalBracket.B_50_100K);
    expect(bracketFromAmount(175_000)).toBe(CapitalBracket.B_100_250K);
    expect(bracketFromAmount(375_000)).toBe(CapitalBracket.B_250_500K);
    expect(bracketFromAmount(750_000)).toBe(CapitalBracket.B_500K_1M);
    expect(bracketFromAmount(2_000_000)).toBe(CapitalBracket.B_OVER_1M);
  });

  it("treats integer boundaries as the start of the UPPER band (semi-open)", () => {
    expect(bracketFromAmount(49_999.99)).toBe(CapitalBracket.B_0_50K);
    expect(bracketFromAmount(50_000)).toBe(CapitalBracket.B_50_100K);

    expect(bracketFromAmount(99_999.99)).toBe(CapitalBracket.B_50_100K);
    expect(bracketFromAmount(100_000)).toBe(CapitalBracket.B_100_250K);

    expect(bracketFromAmount(249_999.99)).toBe(CapitalBracket.B_100_250K);
    expect(bracketFromAmount(250_000)).toBe(CapitalBracket.B_250_500K);

    expect(bracketFromAmount(499_999.99)).toBe(CapitalBracket.B_250_500K);
    expect(bracketFromAmount(500_000)).toBe(CapitalBracket.B_500K_1M);

    expect(bracketFromAmount(999_999.99)).toBe(CapitalBracket.B_500K_1M);
    expect(bracketFromAmount(1_000_000)).toBe(CapitalBracket.B_OVER_1M);
  });

  it("accepts a Prisma.Decimal (DB column type) without float drift", () => {
    expect(bracketFromAmount(new Prisma.Decimal("49999.99"))).toBe(CapitalBracket.B_0_50K);
    expect(bracketFromAmount(new Prisma.Decimal("50000.00"))).toBe(CapitalBracket.B_50_100K);
    expect(bracketFromAmount(new Prisma.Decimal("1000000"))).toBe(CapitalBracket.B_OVER_1M);
  });

  it("accepts a numeric string", () => {
    expect(bracketFromAmount("175000")).toBe(CapitalBracket.B_100_250K);
    expect(bracketFromAmount("49999.99")).toBe(CapitalBracket.B_0_50K);
  });

  it("rejects negative amounts", () => {
    expect(() => bracketFromAmount(-1)).toThrow(RangeError);
  });

  it("rejects non-finite / unparsable amounts", () => {
    expect(() => bracketFromAmount(Number.NaN)).toThrow(RangeError);
    expect(() => bracketFromAmount(Number.POSITIVE_INFINITY)).toThrow(RangeError);
    expect(() => bracketFromAmount("abc")).toThrow(RangeError);
  });
});

describe("resolveCapital", () => {
  it("derives the bracket from an exact amount (amount wins over a client bracket)", () => {
    expect(
      resolveCapital({ capitalAmount: 175_000, capitalBracket: CapitalBracket.B_OVER_1M }),
    ).toEqual({ capitalAmount: 175_000, capitalBracket: CapitalBracket.B_100_250K });
  });

  it("stores the bracket alone and clears the amount when only a bracket is given", () => {
    expect(resolveCapital({ capitalBracket: CapitalBracket.B_500K_1M })).toEqual({
      capitalAmount: null,
      capitalBracket: CapitalBracket.B_500K_1M,
    });
  });

  it("clears both when both are explicitly empty", () => {
    expect(resolveCapital({ capitalAmount: null, capitalBracket: null })).toEqual({
      capitalAmount: null,
      capitalBracket: null,
    });
  });

  it("returns undefined (untouched) when neither field is provided", () => {
    expect(resolveCapital({})).toBeUndefined();
  });
});
