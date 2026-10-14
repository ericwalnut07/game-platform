import { expect, test } from "@playwright/test";

test("formal rulebook matches v1 and keeps legacy explanations separate", async ({ page }, info) => {
  await page.goto("/#/rules/commercial-hub");
  const rules = page.getByRole("article", { name: "正式版1.0ルール" });
  await expect(rules).toBeVisible();
  await expect(rules).toContainText("Lv3特別消費ブームは8トリック");
  await expect(rules).toContainText("同じ地区に自社の異なる系統");
  await expect(rules).toContainText("残資金は得点に換算しません");
  await expect(rules).toContainText("中央タワー");
  await expect(rules).toContainText("0/2/4/6/8/10/12点");
  await expect(rules).toContainText("商品2→資金5");
  await expect(rules).not.toContainText("最大12ラウンドは共通");
  await expect(rules).not.toContainText("NEXT試遊版：建設");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: info.outputPath("formal-rulebook.png"), fullPage: true });
  await page.getByLabel("表示するルール").selectOption("V05");
  await expect(rules).toHaveCount(0);
  await expect(page.getByText("RULES v0.5 · 4席対戦", { exact: true })).toBeVisible();
  await expect(page.getByText(/最低10R・最大12R/)).toBeVisible();
  await expect(page.getByRole("article")).toContainText("1/3/5/7/9/11点");
  await page.getByLabel("表示するルール").selectOption("FORMAL");
  await expect(rules).toBeVisible();
  await page.goto("/#/create/commercial-hub");
  await expect(page.getByLabel("ルールセット", { exact: true })).toHaveValue("FORMAL");
  await page.getByLabel("ルールセット", { exact: true }).selectOption("NEXT");
  await expect(page.getByText("NEXT試遊版の検証用設定です。", { exact: false })).toBeVisible();
});

