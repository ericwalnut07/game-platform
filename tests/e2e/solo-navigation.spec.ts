import { expect, test } from "@playwright/test";

test("solo registry preserves TOP entries, game setup routes and direct links", async ({ page }) => {
  await page.goto("/");
  for (const name of ["1人で遊ぶ", "部屋を作る", "部屋に入る"]) {
    await expect(page.getByRole("button", { name: new RegExp(`^${name}`) })).toBeVisible();
  }
  await page.getByRole("button", { name: /^1人で遊ぶ/ }).click();
  await expect(page.getByRole("heading", { name: "1人で遊ぶ", exact: true })).toBeVisible();
  await expect(page.locator(".home-actions .action-card")).toHaveCount(5);

  // Exercise only the setup navigation affected by this refactor, not game play.
  for (const [id, title] of [
    ["two-sided-labyrinth", "表裏一体迷宮"],
    ["ooishi-territory", "大石のテリトリー"],
    ["ooishi-territory-2", "大石のテリトリー2"]
  ] as const) {
    await page.goto("/#/solo");
    await page.getByRole("button").filter({ has: page.getByText(title, { exact: true }) }).click();
    await expect(page).toHaveURL(new RegExp(`#/solo/${id}$`));
    await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
    if (id.startsWith("ooishi-")) {
      await expect(page.getByRole("button", { name: "この設定で試遊する" })).toBeVisible();
      await expect(page.getByText("1人で遊ぶ · 全席操作", { exact: true })).toBeVisible();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await page.reload();
    await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
    await page.goBack();
    await expect(page.getByRole("heading", { name: "1人で遊ぶ", exact: true })).toBeVisible();
  }
});

test("unknown solo routes return to the game list", async ({ page }) => {
  await page.goto("/#/solo/unknown-game");
  await expect(page.getByRole("heading", { name: "1人用ゲームが見つかりません" })).toBeVisible();
  await page.getByRole("button", { name: "1人用ゲーム一覧へ" }).click();
  await expect(page).toHaveURL(/#\/solo$/);
  await expect(page.getByRole("heading", { name: "1人で遊ぶ", exact: true })).toBeVisible();
});
