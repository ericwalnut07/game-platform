import { expect, test, type Page } from "@playwright/test";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { readFile } from "node:fs/promises";
import type { RobotOfflineSave } from "../../src/games/robot-tactics/offlineSession";
const fixture = pathToFileURL(resolve("test-results/robot-offline-fixture/index.html")).href;
const app = pathToFileURL(resolve("dist/robot-tactics-offline/index.html")).href;
async function savedRaw(page: Page): Promise<string> {
  return page.evaluate(() => new Promise<string>((resolve, reject) => { const r = indexedDB.open("robot-tactics-offline", 1); r.onerror = () => reject(r.error); r.onsuccess = () => { const db = r.result, tx = db.transaction("checkpoints"), read = tx.objectStore("checkpoints").get("save"); read.onsuccess = () => { db.close(); resolve(read.result as string); }; }; }));
}
async function saved(page: Page): Promise<RobotOfflineSave> { return JSON.parse(await savedRaw(page)) as RobotOfflineSave; }
async function openAddons(page: Page, profile = "addons") {
  await page.goto(fixture + "?profile=" + profile); await page.getByRole("button", { name: "機体カスタマイズ", exact: true }).click();
  await page.getByRole("button", { name: /^コアA ·/ }).click(); await page.getByRole("navigation", { name: "装備カテゴリー" }).getByRole("button", { name: "追加パーツ", exact: true }).click();
}
async function part(page: Page, name: string) { await page.getByRole("button", { name: new RegExp("^" + name + "(?: ·|$)") }).click(); }
async function equip(page: Page) { await page.getByRole("button", { name: "装備する", exact: true }).click(); }

test("multiple addons compare CAP, equip/remove independently and survive reload fully offline", async ({ page, context }) => {
  await context.setOffline(true); const errors: string[] = [], network: string[] = []; page.on("pageerror", e => errors.push(e.message)); page.on("request", r => { if (/^https?:|^wss?:/.test(r.url())) network.push(r.url()); });
  await openAddons(page); const before = await saved(page); await part(page, "通常攻撃補助・小");
  const table = page.getByRole("table", { name: "追加パーツの性能とCAP差分" }); await expect(table).toHaveCount(1); await expect(table.locator(".difference-worse")).toHaveText("+12");
  await equip(page); await expect(table.getByRole("columnheader", { name: "解除時の差" })).toBeVisible(); await expect(table.locator(".difference-better")).toHaveText("-12");
  await part(page, "高速充電回路"); await equip(page); await expect(page.getByRole("region", { name: "現在の装備" })).toContainText("通常攻撃補助・小、高速充電回路");
  await expect(page.getByRole("region", { name: "パーツ強化" })).toHaveCount(0); await expect(page.getByRole("region", { name: "コアの現在性能" })).toContainText("基本装備までの値");
  await part(page, "通常攻撃補助・小"); await page.getByRole("button", { name: "装備を解除する", exact: true }).click();
  const after = await saved(page); expect(after.progress.party[0]!.addons).toEqual([{ partId: "fast-charge" }]); expect(after.progress.exp).toBe(before.progress.exp); expect(after.progress.partLevels).toEqual(before.progress.partLevels); expect(after.progress.party.map(c => c.basic)).toEqual(before.progress.party.map(c => c.basic));
  await page.reload(); expect((await saved(page)).progress).toEqual(after.progress); expect(errors).toEqual([]); expect(network).toEqual([]); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test("explicit movement choices change in place and invalid removal requires an explicit repair", async ({ page, context }) => {
  await context.setOffline(true); await openAddons(page); await part(page, "移動タイプ追加"); const raw = await savedRaw(page);
  await expect(page.getByRole("button", { name: "装備する", exact: true })).toBeDisabled(); await page.getByLabel("装備時の移動タイプ", { exact: true }).selectOption("diagonal"); expect(await savedRaw(page)).toBe(raw); await equip(page);
  await part(page, "移動タイプ変更"); await page.getByLabel("装備時の移動タイプ", { exact: true }).selectOption("omni"); await equip(page);
  await part(page, "移動タイプ追加"); await page.getByLabel("装備時の移動タイプ", { exact: true }).selectOption("straight"); await page.getByRole("button", { name: "設定を変更する", exact: true }).click();
  const changed = await saved(page); expect(changed.progress.party[0]!.addons).toEqual([{ partId: "movement-type-add", movementType: "straight" }, { partId: "movement-type-replace", movementType: "omni" }]);
  await part(page, "移動タイプ変更"); await expect(page.getByRole("button", { name: "装備を解除する", exact: true })).toBeDisabled(); await expect(page.getByText(/追加する移動タイプが元のタイプと同じです。/)).toBeVisible(); expect(await savedRaw(page)).toBe(JSON.stringify(changed));
  await part(page, "移動タイプ追加"); await page.getByLabel("装備時の移動タイプ", { exact: true }).selectOption("diagonal"); await page.getByRole("button", { name: "設定を変更する", exact: true }).click();
  await part(page, "移動タイプ変更"); await page.getByRole("button", { name: "装備を解除する", exact: true }).click(); await expect(page.getByRole("region", { name: "コアの現在性能" })).toContainText("選択中の移動タイプ：直線・斜線"); expect((await saved(page)).progress.party[0]!.addons).toEqual([{ partId: "movement-type-add", movementType: "diagonal" }]);
});
test("CAP overflow and locked equipment stay disabled without writing a checkpoint", async ({ page, context, browser }) => {
  await context.setOffline(true); await openAddons(page, "addons-low-cap"); const raw = await savedRaw(page); await part(page, "通常攻撃補助・小");
  await expect(page.getByRole("button", { name: "装備する", exact: true })).toBeDisabled(); await expect(page.getByText(/CAP上限を超えています。/)).toBeVisible(); expect(await savedRaw(page)).toBe(raw);
  const fresh = await browser.newContext({ offline: true }); try { const target = await fresh.newPage(); await target.goto(app); await target.getByRole("button", { name: "機体カスタマイズ", exact: true }).click(); await target.getByRole("button", { name: /^コアA ·/ }).click(); await target.getByRole("navigation", { name: "装備カテゴリー" }).getByRole("button", { name: "追加パーツ", exact: true }).click(); await part(target, "高速充電回路"); await expect(target.getByRole("button", { name: "装備する", exact: true })).toBeDisabled(); await expect(target.getByText(/未解放です。/)).toBeVisible(); } finally { await fresh.close(); }
});
test("failed equipment save retries once and exports/imports choices to a fresh offline app", async ({ page, context, browser }) => {
  await context.setOffline(true); await openAddons(page); await part(page, "移動タイプ変更"); await page.getByLabel("装備時の移動タイプ", { exact: true }).selectOption("forward"); const raw = await savedRaw(page);
  await page.evaluate(() => { const original = IDBObjectStore.prototype.put; IDBObjectStore.prototype.put = function() { IDBObjectStore.prototype.put = original; throw new DOMException("保存領域不足", "QuotaExceededError"); }; });
  await equip(page); await expect(page.getByRole("alert")).toContainText("保存領域不足"); expect(await savedRaw(page)).toBe(raw); await equip(page); const after = await saved(page); expect(after.revision).toBe((JSON.parse(raw) as RobotOfflineSave).revision + 1);
  await page.getByRole("button", { name: "ホーム", exact: true }).click(); await page.getByRole("button", { name: "設定", exact: true }).click(); const pending = page.waitForEvent("download"); await page.getByRole("button", { name: "バックアップを書き出す", exact: true }).click(); const download = await pending, backup = await readFile((await download.path())!); expect(download.suggestedFilename()).toBe("robot-tactics-backup-v2.json");
  const fresh = await browser.newContext({ offline: true }); try { const target = await fresh.newPage(); await target.goto(app); await target.getByRole("button", { name: "設定", exact: true }).click(); target.once("dialog", d => d.accept()); await target.getByLabel("バックアップを読み込む").setInputFiles({ name: "addons.json", mimeType: "application/json", buffer: backup }); await expect.poll(async () => (await saved(target)).progress.party[0]!.addons).toEqual(after.progress.party[0]!.addons); expect((await saved(target)).progress).toEqual(after.progress); await target.reload(); expect((await saved(target)).version).toBe(2); } finally { await fresh.close(); }
});
test("equipped departure survives retry and direct resume without battle editing or double actions", async ({ page, context }) => {
  await context.setOffline(true); await openAddons(page); await part(page, "高速充電回路"); await equip(page); await part(page, "移動タイプ追加"); await page.getByLabel("装備時の移動タイプ", { exact: true }).selectOption("diagonal"); await equip(page); const p = (await saved(page)).progress;
  await page.getByRole("button", { name: "ホーム", exact: true }).click(); await page.getByRole("button", { name: "ミッション選択", exact: true }).click(); await page.getByRole("button", { name: /^M01 / }).click(); await page.getByRole("button", { name: "Easy", exact: true }).click(); expect((await saved(page)).battle!.departure.party).toEqual(p.party);
  await page.getByRole("button", { name: "オプション", exact: true }).click(); page.once("dialog", d => d.accept()); await page.getByRole("button", { name: "再挑戦", exact: true }).click(); await expect(page.getByText("確定済み行動 0件")).toBeVisible(); await page.reload(); await expect(page.getByText("確定済み行動 0件")).toBeVisible(); await expect(page.getByRole("button", { name: "機体カスタマイズ", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "次の確定行動を検証", exact: true }).click(); await expect(page.getByText("確定済み行動 1件")).toBeVisible(); const s = await saved(page); expect(s.battle!.departure.party).toEqual(p.party); expect(s.progress).toEqual(p); await page.reload(); expect(await saved(page)).toEqual(s);
});
