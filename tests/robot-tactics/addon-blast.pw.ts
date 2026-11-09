import { expect, test, type Page, type BrowserContext } from "@playwright/test";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { mkdirSync } from "node:fs";
import { pathToFileURL } from "node:url";
import type { RobotOfflineSave } from "../../src/games/robot-tactics/offlineSession";
import type { RobotPosition } from "../../src/games/robot-tactics/movement";
const h = createRequire(import.meta.url)(resolve("test-results/robot-formal-harness/controller.cjs")) as typeof import("./formalHarness");
const weapon = "heavy-missile-cannon", boss = "enemy-supreme-commander";
async function saved(page: Page): Promise<RobotOfflineSave> {
  return page.evaluate(() => new Promise((resolve, reject) => { const r = indexedDB.open("robot-tactics-offline", 1); r.onerror = () => reject(r.error); r.onsuccess = () => { const db = r.result, tx = db.transaction("checkpoints"), read = tx.objectStore("checkpoints").get("save"); read.onsuccess = () => { db.close(); resolve(JSON.parse(read.result as string)); }; read.onerror = () => reject(read.error); }; }));
}
async function command(page: Page, mode: "burst" | "double") {
  await page.getByRole("navigation", { name: "戦闘操作" }).getByRole("button", { name: mode === "burst" ? "攻撃" : "特殊", exact: true }).click();
  await page.getByLabel("行動の種類", { exact: true }).selectOption(mode + ":" + weapon);
}
async function tap(page: Page, cell: RobotPosition) {
  await page.getByRole("button", { name: "俯瞰", exact: true }).click();
  const name = String.fromCharCode(65 + cell.x) + (cell.y + 1);
  // Staged blast selects on the first overview tap; it also refocuses the camera.
  await page.getByRole("grid").locator(`g[data-cell="${name}"]`).click();
}
async function tapUnit(page: Page, id: string) { const s = h.decodeRobotBattleCore((await saved(page)).battle!.snapshot); await tap(page, h.getRobotBattleUnit(s, id).position!); }
async function fixture(page: Page, context: BrowserContext, low = false) {
  await context.setOffline(true); await page.clock.install();
  await page.goto(pathToFileURL(resolve("test-results/robot-weapon-fixture/index.html")).href + "?case=area-addon" + (low ? "-low" : ""));
  await expect(page.getByRole("grid")).toBeVisible();
}
async function actualM01(page: Page, context: BrowserContext) {
  await context.setOffline(true); await page.clock.install();
  let progress = h.offlineAddonFixtureProgress();
  for (const partId of ["empty-tile-targeting", "blast-target-expander", "double-detonation-control"]) progress = h.applyRobotCustomization(progress, { kind: "addon-equip", coreId: "core-c", partId });
  progress = h.applyRobotCustomization(progress, { kind: "part-equip", coreId: "core-c", slot: "weapon2", partId: weapon });
  await page.goto(pathToFileURL(resolve("dist/robot-tactics-offline/index.html")).href);
  await page.getByRole("button", { name: "設定", exact: true }).click(); page.once("dialog", d => d.accept());
  await page.getByLabel("バックアップを読み込む", { exact: true }).setInputFiles({ name: "explicit-earned-addon-progression.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ ...h.createRobotOfflineSave(), progress })) });
  await expect.poll(async () => (await saved(page)).progress.party[2]!.addons.length).toBe(3);
  await page.getByRole("button", { name: "ホーム", exact: true }).click(); await page.getByRole("button", { name: "ミッション選択", exact: true }).click(); await page.getByRole("button", { name: /^M01 / }).click(); await page.getByRole("button", { name: "Easy", exact: true }).click(); await expect(page.getByRole("grid")).toBeVisible();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  for (let n = 0; n < 20; n++) {
    await page.clock.runFor(1000); const save = await saved(page), s = h.decodeRobotBattleCore(save.battle!.snapshot), actor = h.getRobotBattleUnit(s, h.getRobotBattleActor(s).unitIds[0]!);
    if (actor.kind === "controlled") {
      if (actor.id === "core-c") {
        // Core's turn pointer can advance before the previous action's visual
        // movement/VFX releases the buttons. Advance the cosmetic clock only;
        // do not skip a turn or alter any saved combat state.
        await page.clock.runFor(3200);
        await expect(page.getByRole("navigation", { name: "戦闘操作" }).getByRole("button", { name: "攻撃", exact: true })).toBeEnabled();
        return;
      }
      await page.getByRole("navigation", { name: "戦闘操作" }).getByRole("button", { name: "特殊", exact: true }).click(); await page.getByLabel("行動の種類", { exact: true }).selectOption("charge"); await page.getByRole("button", { name: "実行", exact: true }).click();
      await expect.poll(async () => (await saved(page)).battle!.sequence).toBeGreaterThan(save.battle!.sequence);
    }
  }
  throw new Error("Real M01 did not reach the equipped actor");
}
function expected(save: RobotOfflineSave, mode: "burst" | "double", locations: Parameters<typeof h.commitRobotBattleBlast>[1]["locations"]) {
  const s = h.decodeRobotBattleCore(save.battle!.snapshot);
  return h.commitRobotBattleBlast(s, { actionId: s.id + ":action:" + s.actionIds.length, turnId: h.robotBattleTurnId(s), weaponId: weapon, mode, locations });
}

test("fixture: four manual blast neighbors use the conditional EN5 once and preserve the protected layers", async ({ page, context }, info) => {
  await fixture(page, context); const before = await saved(page), s = h.decodeRobotBattleCore(before.battle!.snapshot), c = h.getRobotBattleBlastOptions(s, weapon, "burst").centers.find(c => c.targetId === boss)!;
  await command(page, "burst"); await tap(page, c.cell);
  for (const id of c.neighborIds.slice(0, 4)) await tapUnit(page, id);
  await expect(page.getByRole("grid").locator(".selected-cell")).toHaveCount(5); await expect(page.getByRole("region", { name: "戦場", exact: true })).toContainText("消費EN5"); expect(await saved(page)).toEqual(before);
  await page.getByRole("button", { name: "決定", exact: true }).click(); await expect.poll(async () => (await saved(page)).battle!.sequence).toBe(1);
  await page.clock.runFor(100); const after = h.decodeRobotBattleCore((await saved(page)).battle!.snapshot); expect(h.getRobotBattleUnit(after, "p1").energy.action!.energyCost).toBe(5); expect(after.latest!.damage).toHaveLength(5);
  await expect(page.locator('[data-vfx="blast"]')).toHaveCount(5);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight)).toBe(true);
  mkdirSync("test-results/robot-vfx-review", { recursive: true }); await page.screenshot({ path: `test-results/robot-vfx-review/${info.project.name}-addon-expanded.png` });
});
test("fixture: EN4 permits two neighbors, disables three, and deselection/cancel never spends resources", async ({ page, context }) => {
  await fixture(page, context, true); const before = await saved(page), s = h.decodeRobotBattleCore(before.battle!.snapshot), c = h.getRobotBattleBlastOptions(s, weapon, "burst").centers.find(c => c.targetId === boss)!;
  await command(page, "burst"); await tap(page, c.cell);
  for (const id of c.neighborIds.slice(0, 2)) await tapUnit(page, id); await expect(page.getByRole("button", { name: "決定", exact: true })).toBeEnabled();
  await tapUnit(page, c.neighborIds[2]!); await expect(page.getByRole("button", { name: "決定", exact: true })).toBeDisabled(); await expect(page.getByRole("region", { name: "戦場", exact: true })).toContainText("EN不足");
  await tapUnit(page, c.neighborIds[2]!); await expect(page.getByRole("button", { name: "決定", exact: true })).toBeEnabled(); await page.getByRole("button", { name: "キャンセル", exact: true }).click(); expect(await saved(page)).toEqual(before);
});
test("fixture: different enemy centers are selected once and overlapping center roles commit EN25 with two hits", async ({ page, context }) => {
  await fixture(page, context); const before = await saved(page), s = h.decodeRobotBattleCore(before.battle!.snapshot), o = h.getRobotBattleBlastOptions(s, weapon, "double"), a = o.centers.find(c => c.targetId === boss)!, b = o.centers.find(c => c.targetId !== null && a.neighborIds.includes(c.targetId))!;
  await command(page, "double"); await tap(page, a.cell); await tapUnit(page, b.targetId!); await page.getByRole("button", { name: "地点2を選ぶ", exact: true }).click(); await tap(page, b.cell);
  // The second center takes its 70% role and is removed from the first neighbor list.
  await expect(page.getByRole("grid").locator(".selected-cell")).toHaveCount(2); await page.getByRole("button", { name: "決定", exact: true }).click(); await expect.poll(async () => (await saved(page)).battle!.sequence).toBe(1);
  const after = h.decodeRobotBattleCore((await saved(page)).battle!.snapshot); expect(after.latest!.damage).toHaveLength(2); expect(new Set(after.latest!.damage.map(d => d.targetId)).size).toBe(2); expect(h.getRobotBattleUnit(after, "p1").energy.action!.energyCost).toBe(25);
});
test("production M01: empty-center burst requires one real enemy, confirms at EN0 and resumes without a fake center hit", async ({ page, context }, info) => {
  await actualM01(page, context); const before = await saved(page), s = h.decodeRobotBattleCore(before.battle!.snapshot), c = h.getRobotBattleBlastOptions(s, weapon, "burst").centers.find(c => c.targetId === null)!;
  expect(c).toBeDefined(); await command(page, "burst"); await tap(page, c.cell); await expect(page.getByRole("button", { name: "決定", exact: true })).toBeDisabled(); await tapUnit(page, c.neighborIds[0]!);
  expect(await saved(page)).toEqual(before); await page.getByRole("button", { name: "決定", exact: true }).click(); await expect.poll(async () => (await saved(page)).battle!.sequence).toBe(before.battle!.sequence + 1);
  await page.clock.runFor(100); const checkpoint = await saved(page), after = h.decodeRobotBattleCore(checkpoint.battle!.snapshot), exp = expected(before, "burst", [{ cell: c.cell, neighborIds: [c.neighborIds[0]!] }]);
  expect(after.latest!.damage).toEqual(exp.latest!.damage); expect(after.latest!.damage).toHaveLength(1); expect(h.getRobotBattleUnit(after, "core-c").energy.action!.energyCost).toBe(0); expect(after.latest!.blastEmptyCenters).toEqual([c.cell]);
  await expect(page.locator('[data-vfx="blast"]')).toHaveCount(2); mkdirSync("test-results/robot-vfx-review", { recursive: true }); await page.screenshot({ path: `test-results/robot-vfx-review/${info.project.name}-M01-empty-blast.png` });
  await page.reload(); expect(await saved(page)).toEqual(checkpoint); await expect(page.locator('[data-vfx="blast"]')).toHaveCount(0);
});
test("production M01: two empty centers, real target taps, durable failure/retry, double confirm, resume and mission retry", async ({ page, context }, info) => {
  await actualM01(page, context); const before = await saved(page), s = h.decodeRobotBattleCore(before.battle!.snapshot), centers = h.getRobotBattleBlastOptions(s, weapon, "double").centers.filter(c => c.targetId === null), a = centers[0]!, aid = a.neighborIds[0]!, b = centers.find(c => c !== a && c.neighborIds.some(id => id !== aid))!, bid = b.neighborIds.find(id => id !== aid)!;
  expect(b).toBeDefined(); const locations = [{ cell: a.cell, neighborIds: [aid] }, { cell: b.cell, neighborIds: [bid] }];
  await command(page, "double"); await tap(page, a.cell); await tapUnit(page, aid); await page.getByRole("button", { name: "地点2を選ぶ", exact: true }).click(); await tap(page, b.cell); await expect(page.getByRole("button", { name: "決定", exact: true })).toBeDisabled(); await tapUnit(page, bid);
  expect(await saved(page)).toEqual(before);
  await page.evaluate(() => { const original = IDBObjectStore.prototype.put; IDBObjectStore.prototype.put = function(this: IDBObjectStore, value: unknown, key?: IDBValidKey) { IDBObjectStore.prototype.put = original; if (this.name === "checkpoints") throw new DOMException("保存領域不足", "QuotaExceededError"); return original.call(this, value, key!); }; });
  await page.getByRole("button", { name: "決定", exact: true }).click(); await expect(page.getByRole("alert").last()).toBeVisible(); expect(await saved(page)).toEqual(before); await expect(page.locator(".robot-battle-fx")).toHaveCount(0);
  await page.getByRole("button", { name: "決定", exact: true }).evaluate((b: HTMLButtonElement) => { b.click(); b.click(); }); await expect.poll(async () => (await saved(page)).battle!.sequence).toBe(before.battle!.sequence + 1); await page.clock.runFor(100);
  const checkpoint = await saved(page), after = h.decodeRobotBattleCore(checkpoint.battle!.snapshot), exp = expected(before, "double", locations);
  expect(after.latest!.damage).toEqual(exp.latest!.damage); expect(h.getRobotBattleUnit(after, "core-c").energy).toEqual(h.getRobotBattleUnit(exp, "core-c").energy); expect(h.getRobotBattleUnit(after, "core-c").energy.action!.energyCost).toBe(25);
  expect(after.latest!.blastEmptyCenters).toHaveLength(2); expect(after.latest!.damage).toHaveLength(2); expect(new Set(after.latest!.damage.map(d => d.targetId)).size).toBe(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); mkdirSync("test-results/robot-vfx-review", { recursive: true }); await page.screenshot({ path: `test-results/robot-vfx-review/${info.project.name}-M01-double-blast.png` });
  await page.reload(); expect(await saved(page)).toEqual(checkpoint); await expect(page.locator(".robot-battle-fx")).toHaveCount(0);
  await page.getByRole("button", { name: "オプション", exact: true }).click(); page.once("dialog", d => d.accept()); await page.getByRole("button", { name: "再挑戦", exact: true }).click(); await expect.poll(async () => (await saved(page)).battle!.sequence).toBe(0);
  const retry = await saved(page); expect(retry.battle!.departure.party).toEqual(before.battle!.departure.party); expect(retry.battle!.departure.battleId).not.toBe(before.battle!.departure.battleId); expect(h.decodeRobotBattleCore(retry.battle!.snapshot).units.filter(u => u.kind === "light").every(u => u.hp === u.maxHp)).toBe(true);
});
