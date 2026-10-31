import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import type { RobotOfflineSave } from "../../src/games/robot-tactics/offlineSession";
import type { RobotBattleCoreState } from "../../src/games/robot-tactics/battleState";

async function saved(page: Page) {
  const raw = await page.evaluate(() => new Promise<string>((resolve, reject) => { const request = indexedDB.open("robot-tactics-offline", 1); request.onerror = () => reject(request.error); request.onsuccess = () => { const db = request.result, tx = db.transaction("checkpoints"), read = tx.objectStore("checkpoints").get("save"); read.onsuccess = () => { db.close(); resolve(read.result as string); }; }; }));
  const save = JSON.parse(raw) as RobotOfflineSave;
  return { save, core: save.battle?.snapshot as unknown as RobotBattleCoreState };
}
async function start(page: Page, context: BrowserContext, kind = "two-hit") {
  await context.setOffline(true); await page.clock.install(); await page.goto(pathToFileURL(resolve("test-results/robot-weapon-fixture/index.html")).href + "?case=" + kind);
  await expect(page.getByRole("grid")).toBeVisible();
  await page.evaluate(() => { const hits: unknown[] = []; (window as Window & { weaponHits?: unknown[] }).weaponHits = hits; document.addEventListener("robot-battle-hit", event => hits.push((event as CustomEvent).detail)); });
}
async function select(page: Page) {
  await page.getByRole("navigation", { name: "戦闘操作" }).getByRole("button", { name: "特殊", exact: true }).click();
  await page.getByRole("grid").locator("g[data-cell]:has(.legal-cell)").first().click();
}
const hits = (page: Page) => page.evaluate(() => (window as Window & { weaponHits?: { kind: string; damage: number; pulse: number }[] }).weaponHits ?? []);

test("real two-hit/recoil action costs EN once, saves once and displays three ordered pulses", async ({ page, context }) => {
  await start(page, context); const before = await saved(page), source = before.core.units.find(u => u.id === "p1")!;
  await select(page); await expect(page.locator(".damage-number")).toHaveCount(0); expect((await saved(page)).save).toEqual(before.save);
  await page.getByRole("button", { name: "実行", exact: true }).click(); await expect.poll(async () => (await saved(page)).save.battle!.sequence).toBe(1);
  await page.clock.runFor(600); const after = await saved(page), actual = await hits(page), unit = after.core.units.find(u => u.id === "p1")!;
  expect(actual.map(h => h.kind)).toEqual(["slash", "thrust", "special:sword-recoil"]); expect(actual.map(h => h.pulse)).toEqual([0,1,2]);
  expect(source.hp - unit.hp).toBe(actual[2]!.damage); expect(unit.energy.action).toEqual({ kind: "other", energyCost: 50 }); expect(unit.energy.normalHitRecovered).toBe(false);
  expect(after.core.turn.actorId).toBe("p2"); expect(after.core.actionIds.length - before.core.actionIds.length).toBe(1);
  await expect(page.getByRole("region", { name: "サマリー" })).toContainText("自傷"); await expect(page.locator(".damage-number")).toHaveText(String(actual[2]!.damage));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight)).toBe(true);
});
test("lethal recoil persists a dropped carrier and respawn queue, then resumes without repeating hits", async ({ page, context }) => {
  await start(page, context, "lethal"); const before = await saved(page), position = before.core.units.find(u => u.id === "p1")!.position;
  await select(page); await page.getByRole("button", { name: "実行", exact: true }).click(); await page.clock.runFor(801);
  const after = await saved(page); expect(after.core.units.find(u => u.id === "p1")).toMatchObject({ hp: 0, position: null, carriedObjectiveId: null });
  expect(after.core.allied.waiting).toMatchObject([{ unitId: "p1", returnRound: before.core.allied.round + 2 }]);
  expect(after.core.objective.kind === "m30" && after.core.objective.state.data).toEqual({ cell: position, carrierId: null, sent: false });
  await expect(page.getByRole("region", { name: "サマリー" })).toContainText("データ落下");
  await page.reload(); await expect(page.getByRole("grid")).toBeVisible(); await page.clock.runFor(1000);
  expect((await saved(page)).save).toEqual(after.save); await expect(page.locator(".robot-battle-fx")).toHaveCount(0); await expect(page.getByRole("heading", { name: "ホーム", exact: true })).toHaveCount(0);
});
test("failed storage exposes no partial first hit, EN cost or recoil, then retries one complete action", async ({ page, context }) => {
  await start(page, context, "lethal"); const before = await saved(page); await select(page);
  await page.evaluate(() => { const original = IDBObjectStore.prototype.put; IDBObjectStore.prototype.put = function() { IDBObjectStore.prototype.put = original; throw new DOMException("保存領域不足", "QuotaExceededError"); }; });
  await page.getByRole("button", { name: "実行", exact: true }).click(); await expect(page.getByRole("alert").last()).toBeVisible();
  expect((await saved(page)).save).toEqual(before.save); expect(await hits(page)).toEqual([]);
  await page.getByRole("button", { name: "実行", exact: true }).click(); await expect.poll(async () => (await saved(page)).save.battle!.sequence).toBe(1);
  expect((await saved(page)).core.allied.waiting).toHaveLength(1); expect((await saved(page)).core.units.find(u => u.id === "p1")!.hp).toBe(0);
});
test("first-hit boss kill skips strike2 and settles one real reward across reload", async ({ page, context }) => {
  await start(page, context, "win"); const before = await saved(page); await select(page);
  await page.getByRole("button", { name: "実行", exact: true }).click(); await expect(page.getByRole("heading", { name: "勝利", exact: true })).toBeVisible();
  const after = await saved(page); expect(after.save.battle).toBeNull(); expect(after.save.result!.result).toBe("won"); expect(after.save.progress.exp).toBe(before.save.progress.exp + after.save.result!.expGained);
  expect(after.save.settledBattleIds).toEqual([before.save.battle!.departure.battleId]); await page.reload(); await expect(page.getByRole("heading", { name: "勝利", exact: true })).toBeVisible(); expect((await saved(page)).save).toEqual(after.save);
});
