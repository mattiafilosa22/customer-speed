import { getTranslations } from "next-intl/server";

import { Card, CardBody } from "@/components/ui";

interface ContactColumnProps {
  email: string | null;
  phone: string | null;
  adminNotes: string | null;
}

/** Labelled definition row: mono small-caps term + value (em-dash when empty). */
function Row({ term, value }: { term: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="label-mono text-muted">{term}</dt>
      <dd className="font-body text-ink text-[13.5px]">{value}</dd>
    </div>
  );
}

/**
 * Contact column for the lead detail (docs/02 §2.4): read-only contact facts
 * (email, phone, admin notes). The creation date moved to the "Sintesi" strip
 * and the capital editor moved to the "Dettagli lead" card to avoid duplicating
 * the same value in two places. Server component — `adminNotes` is display-only.
 */
export async function ContactColumn({ email, phone, adminNotes }: ContactColumnProps) {
  const t = await getTranslations("leadDetail");

  return (
    <Card>
      <CardBody className="flex flex-col gap-4">
        <h2 className="font-display text-ink text-lg">{t("contact.title")}</h2>

        <dl className="flex flex-col gap-3">
          <Row term={t("contact.email")} value={email ?? "—"} />
          <Row term={t("contact.phone")} value={phone ?? "—"} />
        </dl>

        <div className="flex flex-col gap-1">
          <h3 className="label-mono text-muted">{t("contact.adminNotes")}</h3>
          <p className="font-body text-muted text-[13.5px] whitespace-pre-wrap">
            {adminNotes ?? "—"}
          </p>
        </div>
      </CardBody>
    </Card>
  );
}
