import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

import type { Page } from "@playwright/test";

/**
 * Lightweight axe-core driver for Playwright (Fase 8 a11y audit, docs/00 §5,
 * docs/05 §5.6) without pulling in a new dependency: we inject the already-present
 * `axe-core` UMD bundle into the page and run it via `page.evaluate`.
 *
 * `runAxe` returns ALL WCAG 2.1 A/AA violations. `blockingViolations` narrows
 * them to the gate bar set by docs/00 §5 and the task ("zero violazioni
 * critiche" / "axe senza violazioni critiche") — impact `critical`. `serious`
 * (and lower) findings are SURFACED by the caller (console + report) for triage
 * but do not fail the gate; the known `serious` debt (muted-text contrast on the
 * `--muted` token across pages — docs/05 §5.6 already flags it) is tracked for
 * the design-system engineer rather than silently masked.
 */

const require = createRequire(import.meta.url);
const AXE_SOURCE = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");

export interface AxeViolation {
  id: string;
  impact: string | null;
  help: string;
  nodes: { target: string[]; failureSummary?: string }[];
}

/** Inject axe and run it against the current page, scoped to WCAG 2.1 A/AA. */
export async function runAxe(page: Page): Promise<AxeViolation[]> {
  await page.evaluate(AXE_SOURCE);
  const result = (await page.evaluate(async () => {
    // `axe` is attached to window by the injected UMD bundle.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const axe = (window as any).axe;
    return axe.run(document, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
      resultTypes: ["violations"],
    });
  })) as { violations: AxeViolation[] };

  return result.violations;
}

/** The subset of violations that FAIL the gate: impact `critical` (docs/00 §5). */
export function blockingViolations(violations: AxeViolation[]): AxeViolation[] {
  return violations.filter((v) => v.impact === "critical");
}

/** `serious` findings — reported for triage but non-blocking (design debt). */
export function seriousViolations(violations: AxeViolation[]): AxeViolation[] {
  return violations.filter((v) => v.impact === "serious");
}

/** Compact, human-readable summary for the test failure message / report. */
export function formatViolations(violations: AxeViolation[]): string {
  return violations
    .map(
      (v) =>
        `  [${v.impact ?? "n/a"}] ${v.id}: ${v.help}\n` +
        v.nodes
          .slice(0, 3)
          .map((n) => `      → ${n.target.join(" ")}`)
          .join("\n"),
    )
    .join("\n");
}
