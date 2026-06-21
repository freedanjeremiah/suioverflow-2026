import { test, expect } from "@playwright/test";

test.describe("market: buy + persistence", () => {
  test("keep a graph → unlimited, persists across reload and pages", async ({ page }) => {
    await page.goto("/market/ml-research");
    await page.getByTestId("keep-graph-cta").click();
    await expect(page.getByText("Kept ✓").first()).toBeVisible();

    await page.reload();
    await expect(page.getByTestId("token-meter")).toHaveText("unlimited");

    // ownership is reflected on the browse page too
    await page.goto("/market");
    await expect(page.getByTestId("card-owned").first()).toBeVisible();
  });
});

test.describe("market: free-question metering", () => {
  test("exhaust free questions → 402 gate → buy unlocks", async ({ page }) => {
    test.setTimeout(180_000); // up to 20 live answers when a key is configured
    await page.goto("/market/trail-knowledge"); // 20 free questions

    // drain the quota through the app's own API (same cookie, real backend)
    const drain = await page.evaluate(async () => {
      const ask = (query: string) =>
        fetch("/api/ask", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ listingId: "trail-knowledge", query }),
        }).then(async (r) => ({ status: r.status, ...(await r.json()) }));

      let last: { status: number; tokensRemaining?: number } = { status: 0 };
      for (let i = 0; i < 20; i++) last = await ask(`q${i}`);
      const gated = await ask("one too many");
      return { last, gated };
    });

    expect(drain.last.tokensRemaining).toBe(0);
    expect(drain.gated.status).toBe(402);

    // the UI surfaces the gate, and keeping the graph unlocks asking again
    await page.reload();
    await expect(page.getByText("used your free questions")).toBeVisible();
    await page.getByTestId("keep-graph").click();
    await expect(page.getByTestId("token-meter")).toHaveText("unlimited");
  });
});
