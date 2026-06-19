"use client";

import { useTranslations } from "next-intl";

/**
 * Root translator that localizes a message KEY arriving at runtime from a Server
 * Action (`ActionState`). next-intl types `t` to literal keys; our action keys
 * are literals defined in the actions module and are guaranteed to exist (the
 * IT/EN parity test enforces presence), but TS cannot follow a `string` through
 * `ActionState`. The cast to the concrete `t` parameter type is done ONCE here.
 */
export function useMessage(): (key: string) => string {
  const t = useTranslations();
  type Key = Parameters<typeof t>[0];
  return (key: string) => t(key as Key);
}
