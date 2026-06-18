import { expect, test } from "@playwright/test";

test.describe("home smoke", () => {
  test("home responds 200 and renders the scaffold heading", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("CustomerSpeed");
  });
});
