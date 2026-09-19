"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import type { FeatureFlags, FeatureFlagKey } from "@/lib/feature-flags";
import { Button, Card, CardBody, Input, Select, Switch } from "@/components/ui";
import { FormAlert } from "@/components/auth/form-alert";
import { useMessage } from "@/components/auth/use-message";
import { updateFeatureFlagsAction, updateOrganizationAction } from "@/app/(admin)/admin/actions";

/**
 * Per-tenant feature flag toggles (docs/01, docs/08 Fase 7). One Switch per
 * module; persists all flags at once via the audited admin Server Action. The
 * flag set mirrors `featureFlagsSchema` so the UI and the data layer stay in
 * sync. Labels are centralized under `admin.flags.*`.
 *
 * `insightStats` additionally exposes the tenant's Insight & Stats
 * configuration (linked `LeadSource` + activation date) right below its
 * switch, visible only while the module is enabled — the flag without a
 * source produces nothing. Those two fields live on `Organization` (not the
 * `featureFlags` JSON), so saving persists them via `updateOrganizationAction`
 * alongside the flags themselves.
 */
const FLAG_KEYS: ReadonlyArray<FeatureFlagKey> = [
  "leads",
  "pipeline",
  "dashboard",
  "appointments",
  "invoices",
  "calendarIntegrations",
  "insightStats",
];

export interface FeatureFlagsFormLeadSourceOption {
  readonly id: string;
  readonly label: string;
}

export function FeatureFlagsForm({
  organizationId,
  initial,
  leadSources = [],
  insightSourceId = null,
  insightActiveFrom = null,
}: {
  organizationId: string;
  initial: FeatureFlags;
  /** Tenant's lead sources, for the Insight & Stats source picker. */
  leadSources?: ReadonlyArray<FeatureFlagsFormLeadSourceOption>;
  /** Currently linked source id, or `null` when unset. */
  insightSourceId?: string | null;
  /** Activation date as `YYYY-MM-DD`, or `null` when unset. */
  insightActiveFrom?: string | null;
}) {
  const t = useTranslations("admin.flags");
  const tm = useMessage();
  const router = useRouter();

  const [flags, setFlags] = useState<FeatureFlags>(initial);
  const [sourceId, setSourceId] = useState(insightSourceId ?? "");
  const [activeFrom, setActiveFrom] = useState(insightActiveFrom ?? "");
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
      await Promise.all([
        updateFeatureFlagsAction({ organizationId, flags }),
        updateOrganizationAction({
          organizationId,
          insightSourceId: sourceId.length > 0 ? sourceId : null,
          insightActiveFrom: activeFrom.length > 0 ? activeFrom : null,
        }),
      ]);
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

        {flags.insightStats ? (
          <div className="flex flex-col gap-3 border-line border-t pt-4">
            <Select
              label={t("insightSource.label")}
              value={sourceId}
              onChange={(e) => setSourceId(e.target.value)}
            >
              <option value="">{t("insightSource.placeholder")}</option>
              {leadSources.map((source) => (
                <option key={source.id} value={source.id}>
                  {source.label}
                </option>
              ))}
            </Select>
            <p className="-mt-2 font-body text-[12px] text-muted">{t("insightSource.hint")}</p>
            <Input
              type="date"
              label={t("insightActiveFrom.label")}
              hint={t("insightActiveFrom.hint")}
              value={activeFrom}
              onChange={(e) => setActiveFrom(e.target.value)}
            />
          </div>
        ) : null}

        <div>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? t("saving") : t("save")}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
