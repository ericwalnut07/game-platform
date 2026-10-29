import { expect, test } from "@playwright/test";

test("seven-mission standalone board opens, moves and switches stages", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/robot-tactics-seven-missions.html");

  await expect(page.locator("#board .tile")).toHaveCount(143);
  await expect(page.locator("#objective")).toContainText("防衛施設");
  await expect(page.locator("#hud")).toContainText("1 / 6");
  await expect(page.locator('[data-cell="F9"]')).toContainText("施");
  await expect(page.locator('[data-cell="G9"]')).toContainText("施");
  await expect(page.locator("#turn")).toContainText("自機");

  // P3 starts with a max-range-one melee weapon; both slash options must be available.
  await expect(page.locator('[data-mode="chargeAttack"]')).toBeEnabled();
  await expect(page.locator('[data-mode="sweep"]')).toBeEnabled();
  await page.locator('[data-mode="chargeAttack"]').click();
  await expect(page.locator('[data-mode="chargeAttack"]')).toHaveClass(/active/);
  await page.locator('[data-mode="sweep"]').click();
  await expect(page.locator('[data-mode="sweep"]')).toHaveClass(/active/);
  await expect(page.locator("#sweepDirections")).toBeVisible();
  await expect(page.locator("#executeSweep")).toBeDisabled();
  await page.locator('[data-mode="move"]').click();
  await expect(page.locator("#sweepDirections")).toBeHidden();
  await page.locator('[data-cell="H9"]').click();
  await expect(page.locator("#status")).toContainText("移動しました");
  await expect(page.locator("#turn")).toContainText("自機");

  await page.locator("#mission").selectOption("1");
  await expect(page.locator('[data-cell="G2"]')).toContainText("150");
  await expect(page.locator("#objective")).toContainText("指揮機");
  await expect(page.locator("#hud")).toContainText("1 / 8"); // Easy M02 adopted limit
  await page.locator("#difficulty").selectOption("normal");
  await expect(page.locator("#hud")).toContainText("1 / 7");
  await page.locator("#difficulty").selectOption("hard");
  await expect(page.locator("#hud")).toContainText("1 / 7");
  await page.locator("#difficulty").selectOption("easy");
  await expect(page.locator("#hud")).toContainText("1 / 8");
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

test("focus-attack order lets player select an enemy target", async ({ page }) => {
  await page.goto("/robot-tactics-seven-missions.html");
  await page.locator('[data-friend="A1"]').selectOption("focus-attack");
  const targetSelect = page.locator('[data-focus="A1"]');
  await expect(targetSelect).toBeVisible();
  await targetSelect.selectOption("assault-1-1");
  await expect(page.locator('[data-focus="A1"]')).toHaveValue("assault-1-1");
  await page.locator("#endTurn").click();
  await page.locator("#endTurn").click();
  await page.locator("#nextGroup").click();
  await expect(page.locator("#log")).toContainText("集中攻撃対象");
});

test("enemy and friendly AI advancement remains usable", async ({ page }) => {
  await page.goto("/robot-tactics-seven-missions.html");
  await page.locator("#autoFriend").check();
  await page.locator("#endTurn").click(); // P3
  await page.locator("#endTurn").click(); // P1
  await expect(page.locator("#nextGroup")).toBeEnabled();
  // Advance the enemy mobile squad until P2 gets the next player turn.
  await page.locator("#nextGroup").click();
  await expect(page.locator("#hud")).toContainText("R");
  await expect(page.locator("#log")).toContainText("R1");
});
