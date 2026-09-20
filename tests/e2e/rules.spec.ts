import { expect, test } from "@playwright/test";

test("external playtest rules page is reachable", async ({ page }) => {
  await page.goto("/#/rules");
  await expect(page.getByRole("heading", { name: "『ポンはいない』遊び方" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "会話の最重要ルール" })).toBeVisible();
  await expect(page.getByText("ポン本人も、自分がポンだとは知らない")).toBeVisible();
});
