"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { Button, Card, CardBody, Input } from "@/components/ui";
import { FormAlert } from "@/components/auth/form-alert";
import { useMessage } from "@/components/auth/use-message";
import { createOrganizationAction } from "@/app/(admin)/admin/actions";

/**
 * Create-tenant form (docs/08 Fase 7). Collects the organization identity and
 * the first proUser, then calls the audited admin Server Action which provisions
 * the tenant + owner ATOMICALLY and emails a "set your password" invite. On
 * success it navigates to the new tenant's configuration page. Validation and
 * uniqueness (slug/email) are enforced server-side; errors are localized via
 * stable i18n keys.
 */
export function CreateTenantForm() {
  const t = useTranslations("admin.create");
  const tm = useMessage();
  const router = useRouter();

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [appName, setAppName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await createOrganizationAction({
        name,
        slug,
        appName,
        owner: { name: ownerName, email: ownerEmail },
      });
      router.push(`/admin/tenants/${result.organizationId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "admin.errors.generic");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex max-w-xl flex-col gap-6">
      {error ? <FormAlert tone="error">{tm(error)}</FormAlert> : null}

      <Card>
        <CardBody className="flex flex-col gap-4">
          <h2 className="font-display text-xl text-ink">{t("sections.org")}</h2>
          <Input
            label={t("fields.name")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
            required
          />
          <Input
            label={t("fields.slug")}
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            maxLength={40}
            required
            aria-describedby="slug-hint"
          />
          <p id="slug-hint" className="-mt-2 font-body text-[12px] text-muted">
            {t("fields.slugHint")}
          </p>
          <Input
            label={t("fields.appName")}
            value={appName}
            onChange={(e) => setAppName(e.target.value)}
            maxLength={60}
            required
          />
        </CardBody>
      </Card>

      <Card>
        <CardBody className="flex flex-col gap-4">
          <h2 className="font-display text-xl text-ink">{t("sections.owner")}</h2>
          <p className="-mt-2 font-body text-[12px] text-muted">{t("sections.ownerHint")}</p>
          <Input
            label={t("fields.ownerName")}
            value={ownerName}
            onChange={(e) => setOwnerName(e.target.value)}
            maxLength={120}
            required
          />
          <Input
            label={t("fields.ownerEmail")}
            type="email"
            value={ownerEmail}
            onChange={(e) => setOwnerEmail(e.target.value)}
            maxLength={254}
            required
          />
        </CardBody>
      </Card>

      <div className="flex gap-3">
        <Button type="submit" disabled={submitting}>
          {submitting ? t("submitting") : t("submit")}
        </Button>
      </div>
    </form>
  );
}
