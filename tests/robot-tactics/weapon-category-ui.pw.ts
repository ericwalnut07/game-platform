import { expect, test, type Page } from "@playwright/test";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import type { RobotOfflineSave } from "../../src/games/robot-tactics/offlineSession";

const fixture = pathToFileURL(resolve("test-results/robot-offline-fixture/index.html")).href;
const families = ["slash", "blunt", "thrust", "assault", "sniper", "blast"] as const;
async function stored(page: Page): Promise<RobotOfflineSave> {
  return page.evaluate(() => new Promise<RobotOfflineSave>((resolve, reject) => {
    const req = indexedDB.open("robot-tactics-offline", 1);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result, tx = db.transaction("checkpoints"), read = tx.objectStore("checkpoints").get("save");
      read.onerror = () => reject(read.error);
      read.onsuccess = () => { db.close(); resolve(JSON.parse(read.result as string) as RobotOfflineSave); };
    };
  }));
}
async function openCustomization(page: Page, win = false) {
  await page.goto(fixture);
  if (win) {
    await page.getByRole("button", { name: "ミッション選択", exact: true }).click();
    await page.getByRole("button", { name: /^M01 / }).click();
    await page.getByRole("button", { name: "Easy", exact: true }).click();
    await page.getByRole("button", { name: "勝利リザルトを検証", exact: true }).click();
    await page.getByRole("button", { name: "カスタマイズへ", exact: true }).click();
  } else await page.getByRole("button", { name: "機体カスタマイズ", exact: true }).click();
  await page.getByRole("button", { name: /^コアA ·/ }).click();
}
async function slot(page: Page, name: "武器①" | "武器②") {
  await page.getByRole("navigation", { name: "装備カテゴリー" })
    .getByRole("button", { name, exact: true }).click();
}
const family = (page: Page, name: string) =>
  page.locator(`.custom-weapon-family[data-weapon-family="${name}"]`);
const toggle = (page: Page, name: string) => family(page, name).locator(":scope > button");
async function checkGroups(page: Page, open: string | null) {
  const groups = page.locator(".custom-weapon-family");
  await expect(groups).toHaveCount(6);
  expect(await groups.evaluateAll(els => els.map(el => (el as HTMLElement).dataset.weaponFamily))).toEqual(families);
  for (const id of families) {
    await expect(toggle(page, id)).toHaveAttribute("aria-expanded", String(open === id));
    if (id !== open) await expect(family(page, id).locator(".custom-weapon-family-parts")).toHaveCount(0);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

test("six weapon categories start with equipped family, collapse/reopen and change slot without changing progress: PC/mobile", async ({ page, context }) => {
  await context.setOffline(true);
  await openCustomization(page);
  const before = await stored(page);
  await slot(page, "武器①");
  await checkGroups(page, "slash");
  await expect(family(page, "slash").getByRole("button", { name: /ライトブレード · 共有Lv1 · 装備中/ })).toBeVisible();
  await toggle(page, "slash").click();
  await checkGroups(page, null);
  await toggle(page, "assault").click();
  await checkGroups(page, "assault");
  await expect(family(page, "assault").getByRole("button", { name: /ライトピストル · 共有Lv1/ })).toBeVisible();
  await slot(page, "武器②");
  await checkGroups(page, "assault");
  await expect(family(page, "assault").getByRole("button", { name: /ライトピストル · 共有Lv1 · 装備中/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /超重レールガン · 共有Lv/ })).toHaveCount(0);
  expect(await stored(page)).toEqual(before);
  await page.reload();
  await page.getByRole("button", { name: "機体カスタマイズ", exact: true }).click();
  await page.getByRole("button", { name: /^コアA ·/ }).click();
  await slot(page, "武器②");
  await checkGroups(page, "assault");
  expect((await stored(page)).progress).toEqual(before.progress);
});

test("weapon details, shared Lv, equip restriction and open family survive re-renders: PC/mobile", async ({ page, context }) => {
  await context.setOffline(true);
  await openCustomization(page, true);
  await slot(page, "武器①");
  await checkGroups(page, "slash");
  await family(page, "slash").getByRole("button", { name: /スタンダードソード · 共有Lv1/ }).click();
  await expect(page.getByRole("table", { name: "パーツ性能と現在装備との差分" })).toBeVisible();
  await expect(page.getByRole("region", { name: "パーツ強化" })).toBeVisible();
  await page.getByRole("button", { name: "パーツを強化する", exact: true }).click();
  await checkGroups(page, "slash");
  await expect(family(page, "slash").getByRole("button", { name: /スタンダードソード · 共有Lv2/ })).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("table", { name: "パーツ性能と現在装備との差分" })).toBeVisible();
  await page.getByRole("button", { name: "装備する", exact: true }).click();
  await checkGroups(page, "slash");
  await expect(family(page, "slash").getByRole("button", { name: /スタンダードソード · 共有Lv2 · 装備中/ })).toBeVisible();
  await slot(page, "武器②");
  await checkGroups(page, "assault");
  await toggle(page, "slash").click();
  await checkGroups(page, "slash");
  await family(page, "slash").getByRole("button", { name: /スタンダードソード · 共有Lv2/ }).click();
  await expect(page.getByRole("button", { name: "装備する", exact: true })).toBeDisabled();
  await expect(page.getByText(/同じコアに同じ武器を重複装備できません/)).toBeVisible();
  const saved = await stored(page);
  expect(saved.progress.party[0]!.basic.weapon1.partId).toBe("standard-sword");
  expect(saved.progress.party[0]!.basic.weapon2.partId).toBe("light-pistol");
  expect(saved.progress.partLevels["standard-sword"]).toBe(2);
  await page.reload();
  expect((await stored(page)).progress).toEqual(saved.progress);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
