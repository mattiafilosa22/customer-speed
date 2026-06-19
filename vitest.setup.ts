import "@testing-library/jest-dom/vitest";

import { afterEach, expect } from "vitest";
import { cleanup } from "@testing-library/react";
import * as axeMatchers from "vitest-axe/matchers";

// Register the `toHaveNoViolations` axe matcher for accessibility smoke tests.
expect.extend(axeMatchers);

// Ensure React Testing Library unmounts components between tests to avoid
// cross-test DOM leakage.
afterEach(() => {
  cleanup();
});
