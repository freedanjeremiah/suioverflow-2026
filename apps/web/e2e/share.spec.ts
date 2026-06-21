import { test, expect } from "@playwright/test";

const BASE_URL = "http://localhost:5173";

test("share a slice → invite link resolves for another visitor", async ({ page, browser }) => {
  await page.goto("/graph");

  // build a selection, then share it
  await page.getByRole("button", { name: "Grow ✦" }).click();
  await page.waitForTimeout(250);
  await page.getByRole("button", { name: "Grow ✦" }).click();
  await page.waitForTimeout(250);
  await page.getByTestId("share-slice").click();

  const link = page.getByTestId("invite-link");
  await expect(link).toBeVisible();
  const url = (await link.textContent())?.trim() ?? "";
  expect(url).toMatch(/\/share\/myc-/);

  // a brand-new visitor opens the link and sees the shared slice
  const recipient = await browser.newContext({ baseURL: BASE_URL });
  const rp = await recipient.newPage();
  const resp = await rp.goto(url);
  expect(resp?.status()).toBe(200);
  await expect(rp.getByText("shared live")).toBeVisible();
  await recipient.close();
});
