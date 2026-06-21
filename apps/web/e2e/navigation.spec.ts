import { test, expect } from "@playwright/test";

test.describe("landing + navigation", () => {
  test("home renders all wired sections (incl. orphan Premise + TrustStrip)", async ({ page }) => {
    await page.goto("/");
    const sections = [
      "trapped in a jar", // Premise (was orphaned)
      "Three steps", // FeatureTriptych
      "Choose a slice", // SliceShowcase
      "Borrow someone", // MarketTeaser
      "answer to you alone", // TrustStrip (was orphaned)
      "Grow a memory worth keeping", // FinalCTA
    ];
    for (const text of sections) {
      const loc = page.getByText(text, { exact: false }).first();
      await loc.scrollIntoViewIfNeeded();
      await expect(loc).toBeVisible();
    }
  });

  test("nav + card click reach the market detail page", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("navigation").getByRole("link", { name: "Market" }).click();
    await expect(page).toHaveURL(/\/market$/);
    await page.getByText("Rust, the hard parts").first().click();
    await expect(page).toHaveURL(/\/market\/rust-mastery$/);
    await expect(page.getByText("Ask this graph")).toBeVisible();
  });
});
