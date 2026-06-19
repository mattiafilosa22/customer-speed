"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { Button, Card, CardBody, Input } from "@/components/ui";
import { FormAlert } from "@/components/auth/form-alert";
import { useMessage } from "@/components/auth/use-message";
import { updateOrganizationAction } from "@/app/(admin)/admin/actions";

/**
 * Tenant identity settings (name, app name, slug, custom domain) — docs/04 §4.10
 * PATCH. Persists via the audited admin Server Action. Theme/brand are handled
 * by the reused white-label panel; feature flags by their own form.
 */
export function TenantSettingsForm({
  organizationId,
  initial,
}: {
  organizationId: string;
  initial: { name: string; appName: string; slug: string; customDomain: string | null };
}) {
  const t = useTranslations("admin.settings");
  const tm = useMessage();
  const router = useRouter();

  const [name, setName] = useState(initial.name);
  const [appName, setAppName] = useState(initial.appName);
  const [slug, setSlug] = useState(initial.slug);
  const [customDomain, setCustomDomain] = useState(initial.customDomain ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    setSaving(true);
    try {
      await updateOrganizationAction({
        organizationId,
        name,
        appName,
        slug,
        customDomain: customDomain.trim().length > 0 ? customDomain : null,
      });
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
      <CardBody>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <h2 className="font-display text-xl text-ink">{t("title")}</h2>

          {error ? <FormAlert tone="error">{tm(error)}</FormAlert> : null}
          {saved ? <FormAlert tone="success">{t("saved")}</FormAlert> : null}

          <Input
            label={t("name")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
            required
          />
          <Input
            label={t("appName")}
            value={appName}
            onChange={(e) => setAppName(e.target.value)}
            maxLength={60}
            required
          />
          <Input
            label={t("slug")}
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            maxLength={40}
            required
          />
          <Input
            label={t("customDomain")}
            value={customDomain}
            onChange={(e) => setCustomDomain(e.target.value)}
            maxLength={253}
            placeholder={t("customDomainPlaceholder")}
          />
          <div>
            <Button type="submit" disabled={saving}>
              {saving ? t("saving") : t("save")}
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
