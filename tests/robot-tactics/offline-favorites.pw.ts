import { expect, test, type Page } from "@playwright/test";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import type { RobotOfflineSave } from "../../src/games/robot-tactics/offlineSession";
const fixture = pathToFileURL(resolve("test-results/robot-offline-fixture/index.html")).href;
async function saved(page: Page): Promise<RobotOfflineSave> {
  return JSON.parse(await page.evaluate(() => new Promise<string>((resolve, reject) => {
    const r = indexedDB.open("robot-tactics-offline", 1); r.onerror = () => reject(r.error);
    r.onsuccess = () => { const db = r.result, read = db.transaction("checkpoints").objectStore("checkpoints").get("save"); read.onsuccess = () => { db.close(); resolve(read.result as string); }; };
  }))) as RobotOfflineSave;
}
async function core(page: Page, id: string) {
  await page.getByRole("button", { name: "機体カスタマイズ", exact: true }).click();
  await page.getByRole("button", { name: new RegExp("^コア" + id + " ·") }).click();
}
async function favorites(page: Page) {
  const detail = page.locator(".custom-favorites");
  if (await detail.getAttribute("open") === null) await detail.locator("summary").first().click();
  return detail;
}
async function register(page: Page, name: string) {
  const list = await favorites(page); await list.getByLabel("新しいお気に入りの名前", { exact: true }).fill(name);
  const revision = (await saved(page)).revision; await list.getByRole("button", { name: "現在の構成を登録", exact: true }).click();
  await expect.poll(async () => (await saved(page)).revision).toBe(revision + 1);
}
test("favorites cap at five per core, rename/overwrite/delete, recall current shared levels and survive reload", async ({ page, context }) => {
  await context.setOffline(true); await page.goto(fixture + "?profile=addons"); await core(page, "A");
  for (let i = 0; i < 5; i++) await register(page, i ? "構成" + i : "<速攻> & Ａ");
  let list = await favorites(page); await expect(list.getByRole("button", { name: "現在の構成を登録", exact: true })).toBeDisabled();
  const before = await saved(page); expect(before.progress.favorites!["core-a"]).toHaveLength(5);
  await page.getByRole("navigation", { name: "装備カテゴリー" }).getByRole("button", { name: "武器①", exact: true }).click();
  await page.getByRole("button", { name: /^ライトブレード ·/ }).click(); await page.getByRole("button", { name: "パーツを強化する", exact: true }).click();
  await page.getByRole("button", { name: /^ヘビーハンマー ·/ }).click(); await page.getByRole("button", { name: "装備する", exact: true }).click();
  list = await favorites(page); await list.getByRole("region", { name: "お気に入り1：<速攻> & Ａ", exact: true }).getByRole("button", { name: "呼び出す", exact: true }).click();
  await expect.poll(async () => (await saved(page)).progress.party[0]!.basic.weapon1).toEqual({ partId: "light-blade", level: 2 });
  list = await favorites(page); const entry = list.getByRole("region", { name: "お気に入り1：<速攻> & Ａ", exact: true });
  await entry.locator("summary").click(); await entry.getByLabel("お気に入りの名前", { exact: true }).fill("改名構成"); await entry.getByRole("button", { name: "名前を変更", exact: true }).click();
  list = await favorites(page); const renamed = list.getByRole("region", { name: "お気に入り1：改名構成", exact: true });
  await renamed.locator("summary").click(); await renamed.getByRole("button", { name: "現在の構成で上書き", exact: true }).click();
  list = await favorites(page); const replaced = list.getByRole("region", { name: "お気に入り1：改名構成", exact: true });
  await replaced.locator("summary").click(); await replaced.getByRole("button", { name: "お気に入りを削除", exact: true }).click();
  await expect.poll(async () => (await saved(page)).progress.favorites!["core-a"]!.length).toBe(4);
  const after = await saved(page); await page.reload(); expect((await saved(page)).progress).toEqual(after.progress); await core(page, "A"); await favorites(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  for (const b of await page.getByRole("button").all()) if (await b.isVisible()) expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(44);
});
test("copy blocks a low-CAP core without any write, then copies all equipment and exchanges frames to another core", async ({ page, context }) => {
  await context.setOffline(true); await page.goto(fixture + "?profile=addons-low-cap"); await core(page, "B");
  await page.getByRole("navigation", { name: "装備カテゴリー" }).getByRole("button", { name: "追加パーツ", exact: true }).click();
  await page.getByRole("button", { name: "高速充電回路", exact: true }).click(); await page.getByRole("button", { name: "装備する", exact: true }).click();
  await register(page, "高CAP構成"); const list = await favorites(page), entry = list.getByRole("region", { name: "お気に入り1：高CAP構成", exact: true }), before = await saved(page);
  await expect(entry.getByText("CAP不足によりコピーできません", { exact: true })).toBeVisible();
  await expect(entry.getByRole("button", { name: "このコアへコピー", exact: true })).toBeDisabled(); expect(await saved(page)).toEqual(before);
  await entry.getByLabel("コピー先のコア", { exact: true }).selectOption("core-c"); await expect(entry.getByRole("button", { name: "このコアへコピー", exact: true })).toBeEnabled();
  await entry.getByRole("button", { name: "このコアへコピー", exact: true }).click();
  await expect.poll(async () => (await saved(page)).revision).toBe(before.revision + 1);
  const after = await saved(page); expect(after.progress.party[2]).toEqual({ ...before.progress.party[2]!, frameId: "reactor-1", basic: before.progress.party[1]!.basic, addons: [{ partId: "fast-charge" }] });
  expect(after.progress.party[1]).toEqual({ ...before.progress.party[1]!, frameId: "defense-1" }); expect(after.progress.party[0]).toEqual(before.progress.party[0]);
  await favorites(page); await page.screenshot({ path: `test-results/robot-feedback-${test.info().project.name}-favorites.png` });
});
test("failed favorite checkpoint keeps the old state and retries once", async ({ page, context }) => {
  await context.setOffline(true); await page.goto(fixture); await core(page, "A"); const before = await saved(page);
  let list = await favorites(page); await list.getByLabel("新しいお気に入りの名前", { exact: true }).fill("保存失敗検証");
  await page.evaluate(() => { const put = IDBObjectStore.prototype.put; IDBObjectStore.prototype.put = function () { IDBObjectStore.prototype.put = put; throw new DOMException("保存領域不足", "QuotaExceededError"); }; });
  await list.getByRole("button", { name: "現在の構成を登録", exact: true }).click(); await expect(page.getByRole("alert")).toContainText("保存領域不足"); expect(await saved(page)).toEqual(before);
  await register(page, "保存再試行"); expect((await saved(page)).progress.favorites!["core-a"]).toHaveLength(1);
  list = await favorites(page); await expect(list.getByRole("heading", { name: "保存再試行", exact: true })).toBeVisible();
});
