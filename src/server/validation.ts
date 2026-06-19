import type { z } from "zod";

import { ValidationError } from "@/lib/errors";

/**
 * Parse `input` with a Zod schema, converting failures to a typed domain
 * `ValidationError` whose `issues` are keyed by field path (docs/00 §2). Shared
 * across server use cases so the boundary-validation behaviour is identical
 * everywhere (auth, leads, …).
 */
export function parseInput<T extends z.ZodTypeAny>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input);
  if (!result.success) {
    const issues: Record<string, string[]> = {};
    for (const issue of result.error.issues) {
      const key = issue.path.join(".") || "(root)";
      (issues[key] ??= []).push(issue.message);
    }
    throw new ValidationError(issues);
  }
  return result.data;
}
