import { getTranslations } from "next-intl/server";

import { Card, CardBody } from "@/components/ui";
import { CapitalBracket } from "@/generated/prisma/enums";
import { CapitalSelect } from "@/components/leads/detail/capital-select";

interface ContactColumnProps {
  leadId: string;
  email: string | null;
  phone: string | null;
  createdAt: string;
  adminNotes: string | null;
  capitalBracket: CapitalBracket | null;
  canSetCapital: boolean;
  canUpdate: boolean;
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
 * plus the capital "specchietto" (an inline editable Select rendered by the
 * client `CapitalSelect`). Server component — `adminNotes` is display-only here.
 */
export async function ContactColumn({
  leadId,
  email,
  phone,
  createdAt,
  adminNotes,
  capitalBracket,
  canSetCapital,
}: ContactColumnProps) {
  const t = await getTranslations("leadDetail");

  return (
    <Card>
      <CardBody className="flex flex-col gap-4">
        <h2 className="font-display text-ink text-lg">{t("contact.title")}</h2>

        <dl className="flex flex-col gap-3">
          <Row term={t("contact.email")} value={email ?? "—"} />
          <Row term={t("contact.phone")} value={phone ?? "—"} />
          <Row term={t("contact.createdAt")} value={createdAt} />
        </dl>

        <div className="flex flex-col gap-1">
          <h3 className="label-mono text-muted">{t("contact.adminNotes")}</h3>
          <p className="font-body text-muted text-[13.5px] whitespace-pre-wrap">
            {adminNotes ?? "—"}
          </p>
        </div>

        <div className="border-line flex flex-col gap-2 border-t pt-4">
          <h3 className="font-display text-ink text-base">{t("capital.title")}</h3>
          <CapitalSelect
            leadId={leadId}
            capitalBracket={capitalBracket}
            canSetCapital={canSetCapital}
          />
        </div>
      </CardBody>
    </Card>
  );
}
