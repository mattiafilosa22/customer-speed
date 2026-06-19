import { Card, CardBody } from "@/components/ui";

/**
 * A single metric tile for the admin global-metrics dashboard (docs/08 Fase 7).
 * Pure presentational, theme-driven (tokens only — no hard-coded colors/fonts).
 */
export function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardBody className="flex flex-col gap-1">
        <span className="font-body text-[13px] text-muted">{label}</span>
        <span className="font-display text-3xl text-ink">{value}</span>
      </CardBody>
    </Card>
  );
}
