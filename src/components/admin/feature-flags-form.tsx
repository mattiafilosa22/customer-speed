"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import type { FeatureFlags, FeatureFlagKey } from "@/lib/feature-flags";
import { Button, Card, CardBody, Switch } from "@/components/ui";
import { FormAlert } from "@/components/auth/form-alert";
import { useMessage } from "@/components/auth/use-message";
import { updateFeatureFlagsAction } from "@/app/(admin)/admin/actions";

/**
 * Per-tenant feature flag toggles (docs/01, docs/08 Fase 7). One Switch per
 * module; persists all flags at once via the audited admin Server Action. The
 * flag set mirrors `featureFlagsSchema` so the UI and the data layer stay in
 * sync. Labels are centralized under `admin.flags.*`.
 */
const FLAG_KEYS: ReadonlyArray<FeatureFlagKey> = [
  "leads",
  "pipeline",
  "dashboard",
  "appointments",
  "invoices",
  "calendarIntegrations",
];

export function FeatureFlagsForm({
  organizationId,
  initial,
}: {
  organizationId: string;
  initial: FeatureFlags;
}) {
  const t = useTranslations("admin.flags");
  const tm = useMessage();
  const router = useRouter();

  const [flags, setFlags] = useState<FeatureFlags>(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function setFlag(key: FeatureFlagKey, value: boolean) {
    setSaved(false);
    setFlags((current) => ({ ...current, [key]: value }));
  }

  async function handleSave() {
    setError(null);
    setSaved(false);
    setSaving(true);
    try {
      await updateFeatureFlagsAction({ organizationId, flags });
      setSaved(true);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "admin.errors.generic");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardBody className="flex flex-col gap-4">
        <h2 className="font-display text-xl text-ink">{t("title")}</h2>
        <p className="-mt-2 font-body text-[12px] text-muted">{t("hint")}</p>

        {error ? <FormAlert tone="error">{tm(error)}</FormAlert> : null}
        {saved ? <FormAlert tone="success">{t("saved")}</FormAlert> : null}

        <div className="flex flex-col gap-3">
          {FLAG_KEYS.map((key) => (
            <Switch
              key={key}
              label={t(`modules.${key}`)}
              checked={flags[key]}
              onCheckedChange={(value) => setFlag(key, value)}
            />
          ))}
        </div>

        <div>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? t("saving") : t("save")}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
