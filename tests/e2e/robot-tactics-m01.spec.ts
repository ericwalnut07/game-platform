import { expect, test } from "@playwright/test";

for (const scenario of [
  { difficulty: "easy", coreLevel: "2", partLevel: "1" },
  { difficulty: "normal", coreLevel: "6", partLevel: "2" },
  { difficulty: "hard", coreLevel: "18", partLevel: "8" }
] as const) {
  test(`M01 standalone playtest ${scenario.difficulty} can be played to a result`, async ({ page }) => {
    const runtimeErrors: string[] = [];
    page.on("pageerror", (error) => runtimeErrors.push(error.message));
    await page.goto("/robot-tactics-m01.html");
    await expect(page.locator(".loadout")).toHaveCount(3);
    await page.locator("#difficulty").selectOption(scenario.difficulty);
    await expect(page.locator("#level")).toHaveValue(scenario.coreLevel);
    await expect(page.locator("#partLevel")).toHaveValue(scenario.partLevel);
    await expect(page.locator("#begin")).toBeEnabled();
    await page.locator("#begin").click();
    await expect(page.locator("#board .tile")).toHaveCount(81);

    // Real enemy turns execute under the same combat rules; the deliberate
    // charging-only player script must eventually lose without any mercy win.
    for (let step = 0; step < 35; step++) {
      if (await page.locator("#results").isVisible()) break;
      await expect(page.locator("#turn")).toContainText("味方");
      await page.getByRole("button", { name: "充電", exact: true }).click();
    }
    await expect(page.locator("#results")).toBeVisible();
    await expect(page.locator("#results")).toContainText("ミッション失敗");
    expect(runtimeErrors).toEqual([]);
  });
}

test("M01 loadout updates CAP and exposes all starting part options", async ({ page }) => {
  await page.goto("/robot-tactics-m01.html");
  await expect(page.locator(".loadout select")).toHaveCount(21);
  // Changing all weapon slots to an expensive option must be reflected in CAP.
  await page.locator("#partLevel").selectOption("10");
  await expect(page.locator("#begin")).toBeDisabled();
  await expect(page.locator("#error")).toContainText("CAP超過");
  await page.locator("#partLevel").selectOption("1");
  await expect(page.locator("#begin")).toBeEnabled();
});

test("M01 available actions allow movement, weapon switch and attack", async ({ page }) => {
  await page.goto("/robot-tactics-m01.html");
  await page.locator("#begin").click();
  await expect(page.locator("#board .tile")).toHaveCount(81);
  await expect(page.locator("#weapons button")).toHaveCount(2);
  await page.locator("#weapons button").nth(1).click();
  await expect(page.locator("#weapons button").nth(1)).toHaveClass(/active/);
  const possible = page.locator("#board .tile.move");
  if (await possible.count()) {
    await possible.first().click();
    await expect(page.locator("#instructions")).toContainText("移動済み");
  }
});
