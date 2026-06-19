import { getTranslations } from "next-intl/server";

/**
 * Shows the outcome of the OAuth callback redirect (`?status=...`) on the
 * integrations page (Fase 6). Known statuses map to a localized message; an
 * unknown value renders nothing (no raw query reflected → no XSS surface).
 */
type KnownStatus = "connected" | "denied" | "invalid_state" | "not_configured";

const TONE: Readonly<Record<KnownStatus, "ok" | "warn">> = {
  connected: "ok",
  denied: "warn",
  invalid_state: "warn",
  not_configured: "warn",
};

function isKnown(value: string): value is KnownStatus {
  return value in TONE;
}

export async function IntegrationStatusBanner({ status }: { status: string }) {
  const t = await getTranslations("integrations.statusBanner");
  // Only render KNOWN statuses → the raw query value is never reflected (no XSS).
  if (!isKnown(status)) return null;
  const tone = TONE[status];

  const classes =
    tone === "ok"
      ? "border-success/30 bg-success/10 text-success"
      : "border-warn/30 bg-warn/10 text-warn";

  return (
    <div role="status" className={`rounded-control border px-4 py-3 font-body text-[13px] ${classes}`}>
      {t(status)}
    </div>
  );
}
