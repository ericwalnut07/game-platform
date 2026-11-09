import { expect, test, type Page } from "@playwright/test";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import type { RobotOfflineSave } from "../../src/games/robot-tactics/offlineSession";

const fixture = pathToFileURL(resolve("test-results/robot-offline-fixture/index.html")).href;
async function checkpoint(page: Page): Promise<RobotOfflineSave> {
  return page.evaluate(() => new Promise<RobotOfflineSave>((resolve, reject) => {
    const open = indexedDB.open("robot-tactics-offline", 1);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result, request = db.transaction("checkpoints").objectStore("checkpoints").get("save");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => { db.close(); resolve(JSON.parse(request.result as string) as RobotOfflineSave); };
    };
  }));
}
async function enter(page: Page) {
  await page.getByRole("button", { name: "機体カスタマイズ", exact: true }).click();
  await page.getByRole("button", { name: /^コアA ·/ }).click();
}
async function assertCombo(page: Page, name: string, families: string, en: number) {
  const summary = page.getByRole("region", { name: "コアの現在性能" });
  const combo = summary.getByRole("region", { name: "装備中の武装コンボ" });
  await expect(combo).toBeVisible();
  await expect(combo.locator(".custom-equipped-combo-name")).toHaveText(name);
  await expect(combo.locator(".custom-equipped-combo-meta")).toHaveText(`${families} ／ 消費EN${en}`);
  expect((await combo.locator(".custom-equipped-combo-description").innerText()).length).toBeGreaterThan(20);
  await expect(summary.getByLabel("現在のフレームと装備武器の外観")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const positions = await page.locator(".custom-machine-weapon, .custom-equipped-combo").evaluateAll(elements =>
    elements.map(element => {
      const box = element.getBoundingClientRect();
      return { x: box.x, y: box.y, right: box.right, bottom: box.bottom, width: box.width, height: box.height };
    }));
  expect(positions).toHaveLength(3);
  const weapon2 = positions[1]!, card = positions[2]!;
  // Desktop: card immediately to the right of weapon②. Short landscape
  // phones: it wraps below rather than clipping into the weapon thumbnail.
  expect(card.x >= weapon2.right - 2 || card.y >= weapon2.bottom - 2).toBe(true);
  expect(card.width).toBeGreaterThan(110);
  expect(card.right).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
}

test("core summary follows equipped two-weapon family combo and survives re-equip/reload offline on desktop/mobile", async ({ page, context }) => {
  await context.setOffline(true);
  await page.goto(fixture + "?profile=addons");
  await enter(page);
  const before = await checkpoint(page);
  await assertCombo(page, "双対象攻撃", "斬撃＋連射", 55);

  await page.getByRole("navigation", { name: "装備カテゴリー" }).getByRole("button", { name: "武器①", exact: true }).click();
  await page.locator('.custom-weapon-family[data-weapon-family="blunt"] > button').click();
  await page.getByRole("button", { name: /^ヘビーハンマー · 共有Lv/ }).click();
  const detailed = await checkpoint(page);
  expect(detailed).toEqual(before); // preview and accordion never save gameplay state
  await page.getByRole("button", { name: "装備する", exact: true }).click();
  await assertCombo(page, "衝撃射撃", "打撃＋連射", 40);
  const equipped = await checkpoint(page);
  expect(equipped.revision).toBe(before.revision + 1);
  expect(equipped.progress.party[0]!.basic.weapon1.partId).toBe("heavy-hammer");

  await page.reload();
  await enter(page);
  await assertCombo(page, "衝撃射撃", "打撃＋連射", 40);
  expect((await checkpoint(page)).progress).toEqual(equipped.progress);

  await page.getByRole("navigation", { name: "装備カテゴリー" }).getByRole("button", { name: "武器①", exact: true }).click();
  await page.locator('.custom-weapon-family[data-weapon-family="slash"] > button').click();
  await page.getByRole("button", { name: /^ライトブレード · 共有Lv/ }).click();
  await page.getByRole("button", { name: "装備する", exact: true }).click();
  await assertCombo(page, "双対象攻撃", "斬撃＋連射", 55);
  expect((await checkpoint(page)).revision).toBe(equipped.revision + 1);
});
