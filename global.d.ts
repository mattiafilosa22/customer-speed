import type { formats } from "@/i18n/formats";
import type { routing } from "@/i18n/routing";
import type messages from "./messages/it.json";

/**
 * next-intl type augmentation: registers the message catalogue, the named
 * formats and the supported locales so that translation keys, format names and
 * locale codes are statically checked across the app (autocomplete + errors on
 * typos / missing keys).
 *
 * The IT catalogue is the canonical shape; `messages/en.json` must stay aligned
 * (same keys) — a missing key surfaces at build/type-check time.
 */
declare module "next-intl" {
  interface AppConfig {
    Messages: typeof messages;
    Formats: typeof formats;
    Locale: (typeof routing.locales)[number];
  }
}
