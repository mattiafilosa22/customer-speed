import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

import type { Page } from "@playwright/test";

/**
 * Lightweight axe-core driver for Playwright (Fase 8 a11y audit, docs/00 §5,
 * docs/05 §5.6) without pulling in a new dependency: we inject the already-present
 * `axe-core` UMD bundle into the page and run it via `page.evaluate`.
 *
 * `runAxe` returns ALL WCAG 2.1 A/AA violations. `blockingViolations` narrows
 * them to the gate bar: ANY `critical` finding, PLUS any `color-contrast`
 * finding at `serious` severity. The color-contrast carve-out is deliberate —
 * after the a11y audit (docs/05 §5.6) there is to be NO remaining
 * critical/serious color-contrast debt, so a regression on the `--muted` token,
 * the stage/tone pills, or the calendar today/out-of-month cells MUST fail the
 * gate. Other `serious` findings (non-contrast) stay triage-only for now.
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

/**
 * The subset of violations that FAIL the gate: any `critical` finding, plus any
 * `color-contrast` finding at `serious` severity (docs/05 §5.6 — no AA contrast
 * debt is allowed to ship after the audit).
 */
export function blockingViolations(violations: AxeViolation[]): AxeViolation[] {
  return violations.filter(
    (v) => v.impact === "critical" || (v.impact === "serious" && v.id === "color-contrast"),
  );
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
