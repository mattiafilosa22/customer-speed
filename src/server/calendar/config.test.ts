import { describe, expect, it } from "vitest";

import { CalendarProviderType } from "@/generated/prisma/enums";
import {
  isEncryptionConfigured,
  isProviderConfigured,
  readCalendlyConfig,
  readGoogleConfig,
} from "@/server/calendar/config";
import { getProvider, getProviderOrThrow } from "@/server/calendar/registry";
import { ProviderNotConfiguredError } from "@/server/calendar/provider";

/**
 * Under the test env (no calendar credentials — the same as the pre-infra state)
 * the module MUST degrade gracefully: configs are null, providers are null, and
 * `getProviderOrThrow` raises a typed error. This mirrors Fabio / a fresh deploy
 * where the flag may be ON but keys are absent.
 */
describe("calendar config (graceful degradation, no credentials)", () => {
  it("returns null configs when credentials are absent", () => {
    expect(readGoogleConfig()).toBeNull();
    expect(readCalendlyConfig()).toBeNull();
    expect(isEncryptionConfigured()).toBe(false);
  });

  it("reports providers as NOT configured", () => {
    expect(isProviderConfigured(CalendarProviderType.GOOGLE)).toBe(false);
    expect(isProviderConfigured(CalendarProviderType.CALENDLY)).toBe(false);
  });

  it("registry returns null instead of constructing a broken provider", () => {
    expect(getProvider(CalendarProviderType.GOOGLE)).toBeNull();
    expect(getProvider(CalendarProviderType.CALENDLY)).toBeNull();
  });

  it("getProviderOrThrow raises ProviderNotConfiguredError", () => {
    expect(() => getProviderOrThrow(CalendarProviderType.GOOGLE)).toThrow(
      ProviderNotConfiguredError,
    );
  });
});
