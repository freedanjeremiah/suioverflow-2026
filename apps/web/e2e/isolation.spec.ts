import { test, expect } from "@playwright/test";

const BASE_URL = "http://localhost:5173";

// There's no auth — visitors are scoped to an anonymous cookie. A purchase by
// one visitor must never leak to another.
test("purchases are isolated per anonymous visitor", async ({ browser }) => {
  const c1 = await browser.newContext({ baseURL: BASE_URL });
  const c2 = await browser.newContext({ baseURL: BASE_URL });
  const p1 = await c1.newPage();
  const p2 = await c2.newPage();

  await p1.goto("/market/kitchen-graph");
  await p1.getByTestId("keep-graph-cta").click();
  await expect(p1.getByText("Kept ✓").first()).toBeVisible();

  const e2 = await (await p2.request.get("/api/entitlements")).json();
  expect(e2.entitlements["kitchen-graph"]?.owned ?? false).toBe(false);

  const e1 = await (await p1.request.get("/api/entitlements")).json();
  expect(e1.entitlements["kitchen-graph"]?.owned).toBe(true);

  await c1.close();
  await c2.close();
});
