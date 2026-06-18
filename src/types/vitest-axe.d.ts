// Registers the `toHaveNoViolations` matcher type on Vitest's `expect`.
// The matcher itself is wired in vitest.setup.ts via expect.extend.
//
// vitest-axe's bundled augmentation targets the legacy `Vi` namespace; Vitest 4
// reads custom matcher types from the `vitest` module's Assertion interface, so
// we augment that explicitly with the matcher's shape.
import type { AxeMatchers } from "vitest-axe/matchers";

declare module "vitest" {
  // Empty extending interfaces are the canonical TS module-augmentation pattern
  // here: they merge the axe matcher signatures into Vitest's assertion types.
  /* eslint-disable @typescript-eslint/no-empty-object-type */
  interface Assertion extends AxeMatchers {}
  interface AsymmetricMatchersContaining extends AxeMatchers {}
  /* eslint-enable @typescript-eslint/no-empty-object-type */
}
