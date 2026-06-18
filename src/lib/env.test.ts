import { describe, expect, it } from "vitest";

import { parseEnv } from "@/lib/env";

describe("parseEnv", () => {
  it("accepts a valid environment", () => {
    const result = parseEnv({
      NODE_ENV: "test",
      DATABASE_URL: "postgresql://user:pass@localhost:5432/customerspeed",
    } as NodeJS.ProcessEnv);

    expect(result.DATABASE_URL).toContain("postgresql://");
    expect(result.NODE_ENV).toBe("test");
  });

  it("rejects a missing DATABASE_URL", () => {
    expect(() => parseEnv({ NODE_ENV: "test" } as NodeJS.ProcessEnv)).toThrowError(/DATABASE_URL/);
  });

  it("rejects a malformed DATABASE_URL", () => {
    expect(() =>
      parseEnv({ NODE_ENV: "test", DATABASE_URL: "not-a-url" } as NodeJS.ProcessEnv),
    ).toThrowError(/DATABASE_URL/);
  });
});
