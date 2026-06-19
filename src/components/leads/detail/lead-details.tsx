import { getTranslations } from "next-intl/server";

import type { ReferenceItem } from "@/server/leads";
import { Card, CardBody } from "@/components/ui";
import { CapitalBracket } from "@/generated/prisma/enums";
import { CapitalSelect } from "@/components/leads/detail/capital-select";
import { SourceSelect } from "@/components/leads/detail/source-select";

interface LeadDetailsProps {
  leadId: string;
  capitalBracket: CapitalBracket | null;
  capitalAmount: number | null;
  canSetCapital: boolean;
  sourceId: string | null;
  sources: readonly ReferenceItem[];
  canUpdate: boolean;
}

/**
 * "Dettagli lead" card — groups the two editable lead attributes under one
 * heading: the capital editor (`CapitalSelect`, unchanged) and the source /
 * provenienza editor (`SourceSelect`, moved here from the removed summary card).
 * Each editor gets its own sub-label (h3) so the editable fields are clearly
 * separated. Server component; the editors themselves are capability-gated.
 */
export async function LeadDetails({
  leadId,
  capitalBracket,
  capitalAmount,
  canSetCapital,
  sourceId,
  sources,
  canUpdate,
}: LeadDetailsProps) {
  const t = await getTranslations("leadDetail");

  return (
    <Card>
      <CardBody className="flex flex-col gap-4">
        <h2 className="font-display text-ink text-lg">{t("details.title")}</h2>

        <div className="flex flex-col gap-2">
          <h3 className="label-mono text-muted">{t("capital.title")}</h3>
          <CapitalSelect
            leadId={leadId}
            capitalBracket={capitalBracket}
            capitalAmount={capitalAmount}
            canSetCapital={canSetCapital}
          />
        </div>

        <div className="border-line flex flex-col gap-2 border-t pt-4">
          <h3 className="label-mono text-muted">{t("summary.source")}</h3>
          <SourceSelect
            leadId={leadId}
            sourceId={sourceId}
            sources={sources}
            canUpdate={canUpdate}
          />
        </div>
      </CardBody>
    </Card>
  );
}
