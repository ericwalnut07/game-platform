import { expect, test } from "@playwright/test";

test("seven-mission standalone board opens, moves and switches stages", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/robot-tactics-seven-missions.html");

  await expect(page.locator("#board .tile")).toHaveCount(143);
  await expect(page.locator("#objective")).toContainText("防衛施設");
  await expect(page.locator('[data-cell="F9"]')).toContainText("施");
  await expect(page.locator('[data-cell="G9"]')).toContainText("施");
  await expect(page.locator("#turn")).toContainText("自機");

  await page.locator('[data-cell="H9"]').click();
  await expect(page.locator("#status")).toContainText("移動しました");
  await expect(page.locator("#turn")).toContainText("自機");

  await page.locator("#mission").selectOption("6");
  await expect(page.locator("#board .tile")).toHaveCount(255);
  await expect(page.locator("#objective")).toContainText("J3でデータ回収");
  await expect(page.locator('[data-cell="J3"]')).toContainText("端");
  await expect(page.locator('[data-cell="I13"]')).toContainText("送");

  await page.locator("#overview").click();
  await expect(page.locator("#boardScroll")).toHaveClass(/board-overview/);
  await page.locator("#overview").click();
  await expect(page.locator("#boardScroll")).not.toHaveClass(/board-overview/);

  expect(errors).toEqual([]);
});

test("enemy and friendly AI advancement remains usable", async ({ page }) => {
  await page.goto("/robot-tactics-seven-missions.html");
  await page.locator("#autoFriend").check();
  await page.locator("#endTurn").click();
  // A complete round progresses through AI in the shared SPD order without needing reload.
  await page.locator("#nextGroup").click();
  await expect(page.locator("#hud")).toContainText("R");
  await expect(page.locator("#log")).toContainText("R1");
});
