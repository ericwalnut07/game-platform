import { expect, test, type Page } from "@playwright/test";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import type { RobotOfflineSave } from "../../src/games/robot-tactics/offlineSession";
const app = pathToFileURL(resolve("dist/robot-tactics-offline/index.html")).href;
const fixture = pathToFileURL(resolve("test-results/robot-offline-fixture/index.html")).href;
async function saved(page: Page): Promise<RobotOfflineSave> {
  return JSON.parse(await page.evaluate(() => new Promise<string>((resolve, reject) => {
    const request = indexedDB.open("robot-tactics-offline", 1); request.onerror = () => reject(request.error);
    request.onsuccess = () => { const db = request.result, tx = db.transaction("checkpoints"), read = tx.objectStore("checkpoints").get("save"); read.onsuccess = () => { db.close(); resolve(read.result as string); }; };
  }))) as RobotOfflineSave;
}
async function individual(page: Page) {
  await page.getByRole("button", { name: "機体カスタマイズ", exact: true }).click();
  await expect(page.getByLabel("操作機3コア").getByRole("button")).toHaveCount(3);
  await page.getByRole("button", { name: /^コアA ·/ }).click();
  await expect(page.getByRole("region", { name: "コアの現在性能" })).toBeVisible();
}
async function earned(page: Page) {
  await page.goto(fixture); await page.getByRole("button", { name: "ミッション選択", exact: true }).click();
  await page.getByRole("button", { name: /^M01 / }).click(); await page.getByRole("button", { name: "Easy", exact: true }).click();
  await page.getByRole("button", { name: "勝利リザルトを検証" }).click();
  await page.getByRole("button", { name: "カスタマイズへ" }).click(); await page.getByRole("button", { name: /^コアA ·/ }).click();
}
test("offline real artifact edits frames with one comparison table, locks and mobile-safe controls", async ({ page, context }) => {
  await context.setOffline(true); const requests: string[] = [], errors: string[] = [];
  page.on("request", r => { if (/^https?:|^wss?:/.test(r.url())) requests.push(r.url()); }); page.on("pageerror", e => errors.push(e.message));
  await page.goto(app); await individual(page); const before = await saved(page);
  await expect(page.getByRole("button", { name: "コアを強化する", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "反応炉型Ⅰ", exact: true }).click();
  await expect(page.getByText("同じフレームグループを他のコアが装備中です。", { exact: true })).toBeVisible(); await expect(page.getByRole("button", { name: "装備する", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "万能型 · 未解放", exact: true }).click();
  await expect(page.getByRole("table")).toHaveCount(1); await expect(page.getByRole("button", { name: "装備する", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "機動型Ⅰ", exact: true }).click();
  const table = page.getByRole("table", { name: "フレーム性能と現在装備との差分" });
  await expect(table.getByRole("row", { name: "HP補正 0 -3", exact: true })).toBeVisible();
  await expect(table.getByRole("row", { name: "HP補正 0 -3", exact: true }).locator("td").last()).toHaveClass("difference-worse");
  await expect(table.getByRole("row", { name: "MOV補正 1 +1", exact: true }).locator("td").last()).toHaveClass("difference-better");
  expect(await table.textContent()).not.toMatch(/[()]/);
  await page.getByRole("button", { name: "装備する", exact: true }).click();
  await expect(page.getByRole("region", { name: "コアの現在性能" })).toContainText("機動型Ⅰ");
  const after = await saved(page); expect(after.revision).toBe(before.revision + 1); expect(after.progress.exp).toBe(before.progress.exp);
  expect(after.progress.party[0]!.frameId).toBe("mobile-1"); expect(after.progress.party[0]!.basic).toEqual(before.progress.party[0]!.basic);
  await page.getByRole("button", { name: "3コア一覧へ", exact: true }).click(); await expect(page.getByRole("button", { name: /^コアA · 機動型Ⅰ/ })).toBeVisible();
  await page.reload(); await individual(page); await expect(page.getByRole("region", { name: "コアの現在性能" })).toContainText("機動型Ⅰ");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  for (const b of await page.getByRole("button").all()) expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect(requests).toEqual([]); expect(errors).toEqual([]);
});
test("training spends the adopted shared EXP once and restores the actual party without repeated rewards", async ({ page, context }) => {
  await context.setOffline(true); await earned(page); const before = await saved(page);
  const summary = page.getByRole("region", { name: "コアの現在性能" }); await expect(summary).toContainText("共有EXP 80");
  await expect(page.getByRole("region", { name: "コア強化" })).toContainText("Lv1 → Lv2 · 必要EXP 70");
  await page.getByRole("button", { name: "コアを強化する", exact: true }).click(); await expect(summary).toContainText("コアA · Lv2");
  await expect(summary).toContainText("共有EXP 10"); await expect(summary).toContainText("CAP 93/105");
  await expect(page.getByRole("button", { name: "コアを強化する", exact: true })).toBeDisabled();
  const after = await saved(page); expect(after.revision).toBe(before.revision + 1); expect(after.progress.party[0]!.coreLevel).toBe(2);
  expect(after.progress.cleared).toEqual(before.progress.cleared); expect(after.progress.party.slice(1)).toEqual(before.progress.party.slice(1));
  await page.reload(); await expect(page.getByRole("heading", { name: "ホーム", exact: true })).toBeVisible(); expect((await saved(page)).progress).toEqual(after.progress);
  await individual(page); await expect(page.getByRole("region", { name: "コアの現在性能" })).toContainText("コアA · Lv2");
});
test("a failed IndexedDB training commit keeps old Lv/EXP and retries exactly once", async ({ page, context }) => {
  await context.setOffline(true); await earned(page); const before = await saved(page);
  await page.evaluate(() => { const original = IDBObjectStore.prototype.put; IDBObjectStore.prototype.put = function() { IDBObjectStore.prototype.put = original; throw new DOMException("保存領域不足", "QuotaExceededError"); }; });
  await page.getByRole("button", { name: "コアを強化する", exact: true }).click(); await expect(page.getByRole("alert")).toContainText("保存領域不足");
  expect(await saved(page)).toEqual(before); await expect(page.getByRole("region", { name: "コアの現在性能" })).toContainText("コアA · Lv1");
  await page.getByRole("button", { name: "コアを強化する", exact: true }).click(); await expect(page.getByRole("region", { name: "コアの現在性能" })).toContainText("コアA · Lv2");
  expect((await saved(page)).progress.exp).toBe(10); expect((await saved(page)).revision).toBe(before.revision + 1);
});
test("edited departure and retry retain training/frame; active battle offers no customization", async ({ page, context }) => {
  await context.setOffline(true); await earned(page); await page.getByRole("button", { name: "コアを強化する", exact: true }).click();
  await page.getByRole("button", { name: "機動型Ⅰ", exact: true }).click(); await page.getByRole("button", { name: "装備する", exact: true }).click();
  const progress = (await saved(page)).progress;
  await page.getByRole("button", { name: "ホーム", exact: true }).click(); await page.getByRole("button", { name: "ミッション選択", exact: true }).click();
  const mission = page.getByRole("button", { name: /^M01 / }); if (await mission.getAttribute("aria-expanded") !== "true") await mission.click();
  await page.getByRole("button", { name: "Easy", exact: true }).click();
  expect((await saved(page)).battle!.departure.party).toEqual(progress.party);
  await expect(page.getByRole("button", { name: "コアを強化する", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "オプション", exact: true }).click(); page.once("dialog", d => d.accept()); await page.getByRole("button", { name: "再挑戦", exact: true }).click();
  await expect(page.getByText("確定済み行動 0件")).toBeVisible(); expect((await saved(page)).battle!.departure.party).toEqual(progress.party);
  await page.reload(); await expect(page.getByText("確定済み行動 0件")).toBeVisible(); expect((await saved(page)).progress).toEqual(progress);
});
