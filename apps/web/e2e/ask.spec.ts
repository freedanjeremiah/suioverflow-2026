import { test, expect } from "@playwright/test";

test.describe("ask panel", () => {
  test("answers a question and decrements the free counter", async ({ page }) => {
    await page.goto("/market/design-taste");
    const meter = page.getByTestId("token-meter");
    const before = (await meter.textContent())?.trim();

    await page.getByTestId("ask-input").fill("What's the single biggest lever for better taste?");
    await page.getByTestId("ask-submit").click();

    const answer = page.getByTestId("answer").first();
    await expect(answer).toBeVisible({ timeout: 60_000 });
    expect((await answer.innerText()).trim().length).toBeGreaterThan(20);

    // the answer shows the "touched" node pills (retrieval is wired)
    expect(await answer.locator("span.mono").count()).toBeGreaterThan(0);

    // a free question was consumed
    await expect(meter).not.toHaveText(before ?? "");
  });

  test("uses the live OpenAI model when OPENAI_API_KEY is configured", async ({ page }) => {
    test.skip(!process.env.OPENAI_API_KEY, "no OPENAI_API_KEY in env (fallback path used instead)");
    await page.goto("/market/rust-mastery"); // establishes the visitor cookie
    const res = await page.request.post("/api/ask", {
      data: { listingId: "rust-mastery", query: "How does borrowing work?" },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.model).toBeTruthy(); // null only on the deterministic fallback
    expect(Array.isArray(body.touched)).toBe(true);
    expect(body.touched.length).toBeGreaterThan(0);
  });
});
