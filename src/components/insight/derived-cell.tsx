import { CellLeadsPopover } from "@/components/insight/cell-leads-popover";

export function DerivedCell({
  date,
  group,
  metric,
  count,
  fromInsight,
  interactive,
  sourceLabel,
}: {
  date: string;
  group: "welcome" | "outbound" | "inbound";
  metric: "appointments" | "sales";
  count: number;
  fromInsight: number;
  interactive: boolean;
  sourceLabel?: string;
}) {
  if (!interactive) {
    return <span className="font-mono text-sm text-ink">{count === 0 ? "–" : count}</span>;
  }
  return (
    <CellLeadsPopover
      date={date}
      group={group}
      metric={metric}
      count={count}
      fromInsight={fromInsight}
      sourceLabel={sourceLabel}
    />
  );
}
