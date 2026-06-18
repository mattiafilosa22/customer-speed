import { describe, expect, it } from "vitest";

import en from "../../messages/en.json";
import itMessages from "../../messages/it.json";
import {
  AppointmentStatus,
  CapitalBracket,
  LeadStage,
} from "@/generated/prisma/enums";

type Json = Record<string, unknown>;

/** Collects the full set of dotted key paths of a nested object. */
function keyPaths(obj: Json, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return value && typeof value === "object" && !Array.isArray(value)
      ? keyPaths(value as Json, path)
      : [path];
  });
}

describe("message catalogues", () => {
  it("IT and EN expose exactly the same key paths (no orphan keys)", () => {
    const itKeys = keyPaths(itMessages as unknown as Json).sort();
    const enKeys = keyPaths(en as unknown as Json).sort();
    expect(enKeys).toEqual(itKeys);
  });

  it("covers every LeadStage value in both locales", () => {
    for (const value of Object.values(LeadStage)) {
      expect(itMessages.enum.leadStage[value]).toBeTruthy();
      expect(en.enum.leadStage[value]).toBeTruthy();
    }
  });

  it("covers every CapitalBracket value in both locales", () => {
    for (const value of Object.values(CapitalBracket)) {
      expect(itMessages.enum.capitalBracket[value]).toBeTruthy();
      expect(en.enum.capitalBracket[value]).toBeTruthy();
    }
  });

  it("covers every AppointmentStatus value in both locales", () => {
    for (const value of Object.values(AppointmentStatus)) {
      expect(itMessages.enum.appointmentStatus[value]).toBeTruthy();
      expect(en.enum.appointmentStatus[value]).toBeTruthy();
    }
  });
});
