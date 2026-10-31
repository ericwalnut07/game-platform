import { expect, test, type Page } from "@playwright/test";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import type { RobotOfflineSave } from "../../src/games/robot-tactics/offlineSession";
const fixture = pathToFileURL(resolve("test-results/robot-offline-fixture/index.html")).href;
async function savedRaw(page: Page): Promise<string> {
  return page.evaluate(() => new Promise<string>((resolve, reject) => { const request = indexedDB.open("robot-tactics-offline", 1); request.onerror = () => reject(request.error); request.onsuccess = () => { const db = request.result, tx = db.transaction("checkpoints"), read = tx.objectStore("checkpoints").get("save"); read.onsuccess = () => { db.close(); resolve(read.result as string); }; }; }));
}
async function saved(page: Page): Promise<RobotOfflineSave> { return JSON.parse(await savedRaw(page)) as RobotOfflineSave; }
async function earned(page: Page) {
  await page.goto(fixture); await page.getByRole("button", { name: "ミッション選択", exact: true }).click(); await page.getByRole("button", { name: /^M01 / }).click(); await page.getByRole("button", { name: "Easy", exact: true }).click();
  await page.getByRole("button", { name: "勝利リザルトを検証", exact: true }).click(); await page.getByRole("button", { name: "カスタマイズへ", exact: true }).click();
  await page.getByRole("button", { name: /^コアA ·/ }).click();
}
async function part(page: Page, category: string, name: string) {
  await page.getByRole("navigation", { name: "装備カテゴリー", exact: true }).getByRole("button", { name: category, exact: true }).click();
  await page.getByRole("button", { name: new RegExp("^" + name + " · 共有Lv") }).click();
}
async function core(page: Page, name: string) {
  await page.getByRole("button", { name: "3コア一覧へ", exact: true }).click(); await page.getByRole("button", { name: new RegExp("^" + name + " ·") }).click();
}
async function chooseMission(page: Page) {
  await page.getByRole("button", { name: "ホーム", exact: true }).click(); await page.getByRole("button", { name: "ミッション選択", exact: true }).click();
  const m = page.getByRole("button", { name: /^M01 / }); if (await m.getAttribute("aria-expanded") !== "true") await m.click(); await page.getByRole("button", { name: "Easy", exact: true }).click();
}

test("one shared purchase updates all three cores, equipment comparison and durable backup", async ({ page, context }) => {
  await context.setOffline(true); await earned(page); await part(page, "武器①", "ライトブレード"); const before = await saved(page);
  await expect(page.getByRole("table", { name: "パーツ性能と現在装備との差分" })).toHaveCount(1);
  await expect(page.getByRole("region", { name: "パーツ強化" })).toContainText("共有Lv1 → Lv2 · 必要EXP 80");
  await expect(page.getByRole("region", { name: "パーツ強化" })).toContainText("コアA・コアB・コアC");
  await page.getByRole("button", { name: "パーツを強化する", exact: true }).click();
  await expect(page.getByRole("button", { name: "ライトブレード · 共有Lv2 · 装備中", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "コアの現在性能" })).toContainText("共有EXP 0");
  const after = await saved(page); expect(after.revision).toBe(before.revision + 1); expect(after.progress.partLevels["light-blade"]).toBe(2); expect(after.progress.party.map(c => c.basic.weapon1.level)).toEqual([2, 2, 2]);
  await core(page, "コアB"); await expect(page.getByRole("region", { name: "現在の装備" })).toContainText("ライトブレード Lv2");
  await page.getByRole("button", { name: "ホーム", exact: true }).click(); await page.getByRole("button", { name: "設定", exact: true }).click();
  const download = page.waitForEvent("download"); await page.getByRole("button", { name: "バックアップを書き出す", exact: true }).click(); expect((await download).suggestedFilename()).toBe("robot-tactics-backup-v2.json");
  await page.reload(); expect((await saved(page)).progress).toEqual(after.progress);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test("trains an unequipped ID, retains its level after swaps and enforces unlock/duplicate rules", async ({ page, context }) => {
  await context.setOffline(true); await earned(page); await part(page, "武器①", "スタンダードソード");
  await expect(page.getByRole("region", { name: "パーツ強化" })).toContainText("未装備"); await page.getByRole("button", { name: "パーツを強化する", exact: true }).click();
  expect((await saved(page)).progress.party.map(c => c.basic.weapon1.partId)).toEqual(["light-blade", "light-blade", "light-blade"]);
  await page.getByRole("button", { name: "装備する", exact: true }).click(); await expect(page.getByRole("region", { name: "現在の装備" })).toContainText("スタンダードソード Lv2");
  await part(page, "武器①", "ライトブレード"); await page.getByRole("button", { name: "装備する", exact: true }).click();
  await core(page, "コアB"); await part(page, "武器①", "スタンダードソード"); await page.getByRole("button", { name: "装備する", exact: true }).click();
  await expect(page.getByRole("region", { name: "現在の装備" })).toContainText("スタンダードソード Lv2");
  const before = await savedRaw(page); await part(page, "武器①", "超重レールガン"); await expect(page.getByRole("button", { name: "装備する", exact: true })).toBeDisabled(); await expect(page.getByRole("button", { name: "パーツを強化する", exact: true })).toBeDisabled();
  await part(page, "武器②", "スタンダードソード"); await expect(page.getByRole("button", { name: "装備する", exact: true })).toBeDisabled(); await expect(page.getByText(/同じコアに同じ武器を重複装備できません。/)).toBeVisible();
  expect(await savedRaw(page)).toBe(before); expect((await saved(page)).progress.partLevels["standard-sword"]).toBe(2);
});
test("failed storage publishes no shared levels or EXP and retry commits once", async ({ page, context }) => {
  await context.setOffline(true); await earned(page); await part(page, "武器①", "ライトブレード"); const before = await savedRaw(page);
  await page.evaluate(() => { const original = IDBObjectStore.prototype.put; IDBObjectStore.prototype.put = function() { IDBObjectStore.prototype.put = original; throw new DOMException("保存領域不足", "QuotaExceededError"); }; });
  await page.getByRole("button", { name: "パーツを強化する", exact: true }).click(); await expect(page.getByRole("alert")).toContainText("保存領域不足"); expect(await savedRaw(page)).toBe(before);
  await expect(page.getByRole("region", { name: "コアの現在性能" })).toContainText("共有EXP 80"); await expect(page.getByRole("button", { name: "ライトブレード · 共有Lv1 · 装備中", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "パーツを強化する", exact: true }).click(); const after = await saved(page); expect(after.progress.exp).toBe(0); expect(after.progress.party.map(c => c.basic.weapon1.level)).toEqual([2, 2, 2]);
  expect(after.revision).toBe((JSON.parse(before) as RobotOfflineSave).revision + 1);
});
test("imports unambiguous v1 data into v2 and rejects conflicting old levels without overwriting", async ({ page, context }) => {
  await context.setOffline(true); await earned(page); const data = JSON.parse(await savedRaw(page)); data.version = 1; delete data.progress.partLevels;
  await page.getByRole("button", { name: "ホーム", exact: true }).click(); await page.getByRole("button", { name: "設定", exact: true }).click();
  page.once("dialog", d => d.accept()); await page.getByLabel("バックアップを読み込む").setInputFiles({ name: "old-v1.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(data)) });
  await expect.poll(async () => (await saved(page)).revision).toBe(data.revision + 1); expect((await saved(page)).version).toBe(2); expect((await saved(page)).progress.partLevels["light-blade"]).toBe(1);
  const before = await savedRaw(page); data.progress.party[0].coreLevel = 41; data.progress.party[0].basic.weapon1.level = 5;
  await page.getByLabel("バックアップを読み込む").setInputFiles({ name: "conflicting-v1.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(data)) });
  await expect(page.getByRole("alert")).toContainText("バックアップを読み込めません"); expect(await savedRaw(page)).toBe(before);
});
test("shared departure retries and v1 battle resume keep builds/actions intact before one v2 checkpoint", async ({ page, context }) => {
  await context.setOffline(true); await earned(page); await part(page, "武器①", "ライトブレード"); await page.getByRole("button", { name: "パーツを強化する", exact: true }).click(); await chooseMission(page);
  let s = await saved(page); expect(s.battle!.departure.party.map(c => c.basic.weapon1.level)).toEqual([2, 2, 2]);
  await page.getByRole("button", { name: "オプション", exact: true }).click(); page.once("dialog", d => d.accept()); await page.getByRole("button", { name: "再挑戦", exact: true }).click();
  await expect(page.getByText("確定済み行動 0件")).toBeVisible(); s = await saved(page); const legacy = JSON.parse(JSON.stringify(s)); legacy.version = 1; delete legacy.progress.partLevels; const raw = JSON.stringify(legacy);
  await page.evaluate(raw => new Promise<void>((resolve, reject) => { const request = indexedDB.open("robot-tactics-offline", 1); request.onerror = () => reject(request.error); request.onsuccess = () => { const db = request.result, tx = db.transaction("checkpoints", "readwrite"); tx.objectStore("checkpoints").put(raw, "save"); tx.oncomplete = () => { db.close(); resolve(); }; tx.onabort = () => reject(tx.error); }; }), raw);
  await page.reload(); await expect(page.getByText("確定済み行動 0件")).toBeVisible(); expect(await savedRaw(page)).toBe(raw); await expect(page.getByRole("button", { name: "機体カスタマイズ", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "次の確定行動を検証", exact: true }).click(); await expect(page.getByText("確定済み行動 1件")).toBeVisible();
  const after = await saved(page); expect(after.version).toBe(2); expect(after.battle!.departure.party).toEqual(s.battle!.departure.party); expect(after.battle!.sequence).toBe(1); expect(after.progress.partLevels["light-blade"]).toBe(2);
  await page.reload(); await expect(page.getByText("確定済み行動 1件")).toBeVisible(); expect(await saved(page)).toEqual(after);
});
