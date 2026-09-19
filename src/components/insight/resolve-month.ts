import { monthSchema } from "@/server/insight/schemas";

function last(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value.at(-1) : value;
}

export function resolveInsightMonth(
  searchParams: Record<string, string | string[] | undefined>,
  now = new Date(),
): { year: number; month: number } {
  const parsed = monthSchema.safeParse({
    year: last(searchParams.year),
    month: last(searchParams.month),
  });
  return parsed.success
    ? parsed.data
    : { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 };
}
