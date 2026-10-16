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
  await expect(page.getByLabel("表示するルール")).toHaveCount(0);
  await page.goto("/#/create/commercial-hub");
  await expect(page.getByLabel("ルールセット", { exact: true })).toHaveValue("FORMAL");
  await expect(page.getByLabel("ルールセット", { exact: true }).locator("option")).toHaveCount(1);
  await expect(page.getByLabel("終了方式", { exact: true })).toBeEnabled();
  await expect(page.getByLabel("大型投資", { exact: true })).toBeEnabled();
});


