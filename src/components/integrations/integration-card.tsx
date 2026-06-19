import { getTranslations } from "next-intl/server";

import { CalendarProviderType } from "@/generated/prisma/enums";
import type { ProviderStatus } from "@/server/calendar/connection-status";
import { Card, CardBody, Pill } from "@/components/ui";
import { DisconnectButton } from "@/components/integrations/disconnect-button";

/**
 * One calendar provider row in the integrations settings (Fase 6). Server
 * component: renders the connection state + the appropriate control. NEVER
 * receives or renders tokens (only booleans + dates from `ProviderStatus`).
 *
 * States:
 *  - not configured (no platform credentials) → informational message;
 *  - configured + not connected → "Connect" link (navigates to the OAuth start);
 *  - configured + connected → "Connected" pill + "Disconnect" button (POST).
 */

const CONNECT_PATHS: Readonly<Record<CalendarProviderType, string>> = {
  [CalendarProviderType.GOOGLE]: "/api/integrations/google/connect",
  [CalendarProviderType.CALENDLY]: "/api/integrations/calendly/connect",
};

const DISCONNECT_PATHS: Readonly<Record<CalendarProviderType, string>> = {
  [CalendarProviderType.GOOGLE]: "/api/integrations/google/disconnect",
  [CalendarProviderType.CALENDLY]: "/api/integrations/calendly/disconnect",
};

export async function IntegrationCard({ status }: { status: ProviderStatus }) {
  const t = await getTranslations("integrations");
  // Explicit (typed) key access — next-intl validates keys at compile time.
  const { name, description } =
    status.provider === CalendarProviderType.GOOGLE
      ? { name: t("providers.google.name"), description: t("providers.google.description") }
      : { name: t("providers.calendly.name"), description: t("providers.calendly.description") };

  return (
    <Card>
      <CardBody className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <h3 className="font-display text-lg text-ink">{name}</h3>
            {status.connected ? (
              <Pill tone="ok">{t("state.connected")}</Pill>
            ) : status.configured ? (
              <Pill tone="warn">{t("state.notConnected")}</Pill>
            ) : (
              <Pill tone="doc">{t("state.notConfigured")}</Pill>
            )}
          </div>
          <p className="font-body text-[13px] text-muted">{description}</p>
        </div>

        <div className="shrink-0">
          {!status.configured ? (
            <p className="font-body text-[12px] text-muted">{t("notConfiguredHint")}</p>
          ) : status.connected ? (
            <DisconnectButton
              endpoint={DISCONNECT_PATHS[status.provider]}
              label={t("actions.disconnect")}
              providerName={name}
            />
          ) : (
            <a
              href={CONNECT_PATHS[status.provider]}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-control bg-accent px-4 font-body text-[13.5px] font-medium text-white transition-colors hover:bg-accent-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {t("actions.connect")}
            </a>
          )}
        </div>
      </CardBody>
    </Card>
  );
}
