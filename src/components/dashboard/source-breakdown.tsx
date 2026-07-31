import { getTranslations } from "next-intl/server";

import type { SourceBreakdownResult } from "@/server/dashboard";
import { Card, CardBody } from "@/components/ui";
import { formatPercent } from "@/i18n/format";

/**
 * "Provenienza lead" (docs/02 §2.2): the period's leads grouped by source, with
 * volume, won, lost and conversion rate — so the tenant sees which channel
 * converts, not only which one brings volume.
 *
 * A real `<table>` (not a div grid): the data IS tabular, so screen readers get
 * row/column semantics and header association for free. The share bar under each
 * label is decorative (`aria-hidden`) — every figure it encodes is already in the
 * cells, so nothing is conveyed by width/colour alone (WCAG 1.4.1).
 *
 * Sources are tenant data (labels come from the DB); the null bucket renders a
 * localized "Non specificato". Server component; empty state when the period has
 * no leads. Responsive: the table scrolls horizontally inside the card on narrow
 * screens instead of overflowing the page.
 */
export async function SourceBreakdown({ breakdown }: { breakdown: SourceBreakdownResult }) {
  const t = await getTranslations("dashboard.sources");

  // Localized percentages resolved server-side (no hard-coded "%", docs/00 §6):
  // the row's conversion rate, plus its share of the period's total volume.
  const rows = await Promise.all(
    breakdown.items.map(async (item) => ({
      ...item,
      convRateLabel: await formatPercent(item.convRate),
      // Guarded against a zero total (empty period renders the empty state, but
      // the division must never produce NaN).
      share: breakdown.total === 0 ? 0 : item.total / breakdown.total,
    })),
  );

  return (
    <Card>
      <CardBody className="flex flex-col gap-4">
        <h2 className="font-display text-ink text-lg">{t("title")}</h2>

        {rows.length === 0 ? (
          <p className="font-body text-muted text-[13.5px]">{t("empty")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] border-collapse text-left">
              <caption className="sr-only">{t("caption")}</caption>
              <thead>
                <tr className="border-line border-b">
                  <th scope="col" className="label-mono text-muted pb-2 font-normal">
                    {t("source")}
                  </th>
                  <th scope="col" className="label-mono text-muted pb-2 text-right font-normal">
                    {t("leads")}
                  </th>
                  <th scope="col" className="label-mono text-muted pb-2 text-right font-normal">
                    {t("won")}
                  </th>
                  <th scope="col" className="label-mono text-muted pb-2 text-right font-normal">
                    {t("lost")}
                  </th>
                  <th scope="col" className="label-mono text-muted pb-2 text-right font-normal">
                    {t("convRate")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.sourceId ?? "__none__"} className="border-line border-b last:border-0">
                    <th scope="row" className="py-2 pr-3 font-normal">
                      <span className="font-body text-ink text-[13.5px]">
                        {row.label ?? t("unspecified")}
                      </span>
                      {/* Decorative share bar — the numbers are in the cells. */}
                      <span
                        aria-hidden="true"
                        className="bg-line2 mt-1 block h-1 w-full max-w-[160px] overflow-hidden rounded-pill"
                      >
                        <span
                          className="bg-accent block h-full rounded-pill"
                          style={{ width: `${Math.round(row.share * 100)}%` }}
                        />
                      </span>
                    </th>
                    <td className="font-body text-ink py-2 text-right text-[13.5px] tabular-nums">
                      {row.total}
                    </td>
                    {/* A zero carries no signal, so it stays neutral: only a
                        non-zero won/lost count takes the semantic colour. */}
                    <td
                      className={`font-body py-2 text-right text-[13.5px] tabular-nums ${
                        row.won > 0 ? "text-ok-ink" : "text-muted"
                      }`}
                    >
                      {row.won}
                    </td>
                    <td
                      className={`font-body py-2 text-right text-[13.5px] tabular-nums ${
                        row.lost > 0 ? "text-danger-ink" : "text-muted"
                      }`}
                    >
                      {row.lost}
                    </td>
                    <td className="font-body text-ink py-2 text-right text-[13.5px] tabular-nums">
                      {row.convRateLabel}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
