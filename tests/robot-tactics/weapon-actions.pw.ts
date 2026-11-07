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
async function selectNormalTarget(page: Page) {
  const target = page.getByRole("grid").locator('g[data-unit-id="enemy-supreme-commander"]');
  await page.getByRole("button", { name: "俯瞰", exact: true }).click();
  await target.click(); // Overview first refocuses; the second tap selects the target.
  await target.click();
}
const hits = (page: Page) => page.evaluate(() => (window as Window & { weaponHits?: { kind: string; damage: number; pulse: number }[] }).weaponHits ?? []);

test("real two-hit/recoil action costs EN once, saves once and displays three ordered pulses", async ({ page, context }) => {
  await start(page, context); const before = await saved(page), source = before.core.units.find(u => u.id === "p1")!;
  await select(page); await expect(page.locator(".damage-number")).toHaveCount(0); expect((await saved(page)).save).toEqual(before.save);
  await page.getByRole("button", { name: "実行", exact: true }).click(); await expect.poll(async () => (await saved(page)).save.battle!.sequence).toBe(1);
  await page.clock.runFor(850); const after = await saved(page), actual = await hits(page), unit = after.core.units.find(u => u.id === "p1")!;
  expect(actual.map(h => h.kind)).toEqual(["slash", "thrust", "special:sword-recoil"]); expect(actual.map(h => h.pulse)).toEqual([0,1,2]);
  expect(source.hp - unit.hp).toBe(actual[2]!.damage); expect(unit.energy.action).toEqual({ kind: "other", energyCost: 50 }); expect(unit.energy.normalHitRecovered).toBe(false);
  expect(after.core.turn.actorId).toBe("p2"); expect(after.core.actionIds.length - before.core.actionIds.length).toBe(1);
  await expect(page.getByRole("region", { name: "サマリー" })).toContainText("自傷"); await expect(page.locator(".damage-number").filter({ hasText: new RegExp(`^${actual[2]!.damage}$`) })).toHaveCount(1);
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

test("EN addons recover once for real normal/charge actions and remain exact across resume/retry", async ({ page, context }) => {
  await start(page, context, "addon-energy"); const before = await saved(page), source = before.core.units.find(u => u.id === "p1")!;
  expect(source.addons?.map(a => a.partId)).toEqual(["opening-capacitor", "fast-charge", "combat-recovery-circuit"]);
  const opening = Math.min(source.energy.maxEn, Math.ceil(source.energy.maxEn * 0.3) + 25); expect(source.energy.en).toBe(opening);
  await page.reload(); await expect(page.getByRole("grid")).toBeVisible(); expect((await saved(page)).save).toEqual(before.save);
  await page.getByRole("navigation", { name: "戦闘操作" }).getByRole("button", { name: "攻撃", exact: true }).click(); await page.getByRole("grid").locator("g[data-cell]:has(.legal-cell)").first().click(); await page.getByRole("button", { name: "実行", exact: true }).click();
  await expect.poll(async () => (await saved(page)).save.battle!.sequence).toBe(1); await page.clock.runFor(801);
  const hit = await saved(page), attacker = hit.core.units.find(u => u.id === "p1")!;
  expect(attacker.energy.en).toBe(Math.min(source.energy.maxEn, opening + 6 + Math.floor(source.energy.maxEn * 0.025) + 8 + 4 + Math.floor(source.energy.maxEn * 0.025))); expect(attacker.energy.normalHitRecovered).toBe(true);
  expect(hit.core.turn.actorId).toBe("p2"); const second = hit.core.units.find(u => u.id === "p2")!;
  await page.getByRole("navigation", { name: "戦闘操作" }).getByRole("button", { name: "特殊", exact: true }).click(); await page.getByRole("button", { name: "実行", exact: true }).click();
  await expect.poll(async () => (await saved(page)).save.battle!.sequence).toBe(2); await page.clock.runFor(801);
  const charged = await saved(page), unit = charged.core.units.find(u => u.id === "p2")!;
  expect(unit.energy.en).toBe(Math.min(second.energy.maxEn, second.energy.en + 20 + Math.floor(second.energy.maxEn * 0.05) + 15 + 4 + Math.floor(second.energy.maxEn * 0.025)));
  await expect(page.getByRole("region", { name: "サマリー" })).toContainText("チャージ");
  await page.reload(); await expect(page.getByRole("grid")).toBeVisible(); expect((await saved(page)).save).toEqual(charged.save);
  await page.getByRole("button", { name: "オプション", exact: true }).click(); page.once("dialog", d => d.accept()); await page.getByRole("button", { name: "再挑戦", exact: true }).click();
  await expect.poll(async () => (await saved(page)).save.battle!.sequence).toBe(0); const retried = await saved(page); expect(retried.core.units.find(u => u.id === "p1")!.energy.en).toBe(opening); expect(retried.save.battle!.departure.party).toEqual(before.save.battle!.departure.party);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight)).toBe(true);
});
test("failed normal-hit addon checkpoint changes no EN and retry publishes one recovery", async ({ page, context }) => {
  await start(page, context, "addon-energy"); const before = await saved(page);
  await page.getByRole("navigation", { name: "戦闘操作" }).getByRole("button", { name: "攻撃", exact: true }).click(); await page.getByRole("grid").locator("g[data-cell]:has(.legal-cell)").first().click();
  await page.evaluate(() => { const original = IDBObjectStore.prototype.put; IDBObjectStore.prototype.put = function() { IDBObjectStore.prototype.put = original; throw new DOMException("保存領域不足", "QuotaExceededError"); }; });
  await page.getByRole("button", { name: "実行", exact: true }).click(); await expect(page.getByRole("alert").last()).toBeVisible(); expect((await saved(page)).save).toEqual(before.save); expect(await hits(page)).toEqual([]);
  await page.getByRole("button", { name: "実行", exact: true }).click(); await expect.poll(async () => (await saved(page)).save.battle!.sequence).toBe(1); const after = await saved(page); expect(after.core.units.find(u => u.id === "p1")!.energy.normalHitRecovered).toBe(true);
  expect(after.core.actionIds.length - before.core.actionIds.length).toBe(1); expect(after.save.progress).toEqual(before.save.progress);
});

for (const [kind, cost] of [["shield-base", 45], ["shield", 45]] as const) test(`${kind} saves one shield action, resumes into one automatic enemy hit and marks the guarded unit`, async ({ page, context }) => {
  await start(page, context, kind); const before = await saved(page), player = before.core.units.find(u => u.id === "p1")!;
  await page.getByRole("navigation", { name: "戦闘操作" }).getByRole("button", { name: "特殊", exact: true }).click(); await expect(page.getByRole("grid").locator(".legal-cell")).toHaveCount(0);
  await page.getByRole("button", { name: "実行", exact: true }).click(); await expect.poll(async () => (await saved(page)).save.battle!.sequence).toBe(1);
  const guarded = await saved(page), u = guarded.core.units.find(u => u.id === "p1")!;
  expect(u.shielded).toBe(true); expect(u.energy.action!.energyCost).toBe(cost); expect(u.energy.en).toBe(player.energy.en - cost + 4 + Math.floor(player.energy.maxEn * 0.025)); expect(guarded.core.latest!.damage).toEqual([]);
  await expect(page.getByRole("region", { name: "サマリー" })).toContainText(`EN${cost}`); await expect(page.locator(".shielded-unit")).toHaveCount(1);
  await page.reload(); await expect(page.getByRole("grid")).toBeVisible(); expect((await saved(page)).save).toEqual(guarded.save);
  await page.clock.runFor(1700); await expect.poll(async () => (await saved(page)).save.battle!.sequence).toBe(2); await page.clock.runFor(801); const after = await saved(page), hit = after.core.latest!.damage[0]!;
  expect(hit.targetId).toBe("p1"); expect(hit.damage).toBeGreaterThanOrEqual(1); expect(after.core.units.find(u => u.id === "p1")!.hp).toBe(player.hp - hit.damage!); expect(after.core.turn.actorId).toBe("p2");
  await page.getByRole("button", { name: "俯瞰", exact: true }).click(); await page.getByRole("grid").locator('g[data-unit-id="p1"]').click(); await expect(page.getByRole("region", { name: "サマリー" })).toContainText("シールド中");
  await page.reload(); await expect(page.getByRole("grid")).toBeVisible(); await page.clock.runFor(1700); expect((await saved(page)).save).toEqual(after.save);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight)).toBe(true);
});
test("failed shield save shows no stance or EN cost and retry commits before enemy automation", async ({ page, context }) => {
  await start(page, context, "shield"); const before = await saved(page); await page.getByRole("navigation", { name: "戦闘操作" }).getByRole("button", { name: "特殊", exact: true }).click();
  await page.evaluate(() => { const original = IDBObjectStore.prototype.put; IDBObjectStore.prototype.put = function() { IDBObjectStore.prototype.put = original; throw new DOMException("保存領域不足", "QuotaExceededError"); }; });
  await page.getByRole("button", { name: "実行", exact: true }).click(); await expect(page.getByRole("alert").last()).toBeVisible(); expect((await saved(page)).save).toEqual(before.save); await expect(page.locator(".shielded-unit")).toHaveCount(0); expect(await hits(page)).toEqual([]);
  await page.getByRole("button", { name: "実行", exact: true }).click(); await expect.poll(async () => (await saved(page)).save.battle!.sequence).toBe(1); await page.clock.runFor(1700);
  await expect.poll(async () => (await saved(page)).save.battle!.sequence).toBe(2); expect((await saved(page)).core.units.find(u => u.id === "p1")!.energy.action!.energyCost).toBe(45);
});

for (const [kind, count, cost] of [["sweep", 2, 0], ["sweep-expanded", 3, 0]] as const) test(`${kind} taps legal enemies directly and commits all hits/recoil in one checkpoint`, async ({ page, context }) => {
  await start(page, context, kind); const before = await saved(page), ids = before.core.actors.find(a => a.unitIds.length === 3)!.unitIds;
  await page.getByRole("navigation", { name: "戦闘操作" }).getByRole("button", { name: "攻撃", exact: true }).click();
  await expect(page.getByLabel("行動の種類", { exact: true }).locator("option:checked")).toHaveText(`薙ぎ払い（最大${count}体・EN${cost}）`);
  await expect(page.getByRole("button", { name: "実行", exact: true })).toBeDisabled();
  for (const id of ids.slice(0, count)) await page.getByRole("grid").locator('g[data-unit-id=' + JSON.stringify(id) + ']').click();
  if (count === 2) { await page.getByRole("grid").locator('g[data-unit-id=' + JSON.stringify(ids[2]) + ']').click(); await expect(page.getByRole("grid").locator(".selected-cell")).toHaveCount(2); }
  await expect(page.getByRole("button", { name: /^(↑|↓|←|→|上|下|左|右)$/ })).toHaveCount(0); await expect(page.locator(".damage-number")).toHaveCount(0); expect((await saved(page)).save).toEqual(before.save);
  await page.getByRole("button", { name: "実行", exact: true }).click(); await expect.poll(async () => (await saved(page)).save.battle!.sequence).toBe(1); await page.clock.runFor(1050);
  const after = await saved(page), attacker = after.core.units.find(u => u.id === "p1")!, damage = after.core.latest!.damage;
  expect(damage.filter(d => d.targetId !== "p1").map(d => d.targetId)).toEqual(ids.slice(0, count)); expect(damage).toHaveLength(count + 1); expect((await hits(page)).map(h => h.kind)).toEqual([...Array(count).fill("slash"), "special:sword-recoil"]);
  expect(attacker.energy.action).toEqual({ kind: "normal-attack", energyCost: cost }); expect(attacker.energy.normalHitRecovered).toBe(cost === 0);
  expect(after.core.actionIds.length - before.core.actionIds.length).toBe(1); expect(after.save.progress).toEqual(before.save.progress); expect(after.core.turn.actorId).toBe("p2");
  await page.reload(); await expect(page.getByRole("grid")).toBeVisible(); await page.clock.runFor(1000); expect((await saved(page)).save).toEqual(after.save); await expect(page.locator(".robot-battle-fx")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight)).toBe(true);
});
test("failed expanded sweep save publishes no partial target, recoil or EN and retries once", async ({ page, context }) => {
  await start(page, context, "sweep-expanded"); const before = await saved(page), ids = before.core.actors.find(a => a.unitIds.length === 3)!.unitIds;
  await page.getByRole("navigation", { name: "戦闘操作" }).getByRole("button", { name: "攻撃", exact: true }).click(); for (const id of ids) await page.getByRole("grid").locator('g[data-unit-id=' + JSON.stringify(id) + ']').click();
  await page.evaluate(() => { const original = IDBObjectStore.prototype.put; IDBObjectStore.prototype.put = function() { IDBObjectStore.prototype.put = original; throw new DOMException("保存領域不足", "QuotaExceededError"); }; });
  await page.getByRole("button", { name: "実行", exact: true }).click(); await expect(page.getByRole("alert").last()).toBeVisible(); expect((await saved(page)).save).toEqual(before.save); expect(await hits(page)).toEqual([]);
  await page.getByRole("button", { name: "実行", exact: true }).click(); await expect.poll(async () => (await saved(page)).save.battle!.sequence).toBe(1); const after = await saved(page); expect(after.core.latest!.damage).toHaveLength(4); expect(after.core.units.find(u => u.id === "p1")!.energy.action!.energyCost).toBe(0);
});
test("expanded sweep at EN0 still confirms three targets and uses existing normal-hit recovery", async ({ page, context }) => {
  await start(page, context, "sweep-expanded"); const before = await saved(page), data = { ...before.save, battle: { ...before.save.battle!, snapshot: { ...before.core, units: before.core.units.map(u => u.id === "p1" ? { ...u, energy: { ...u.energy, en: 0 } } : u) } } };
  await page.evaluate(raw => new Promise<void>((resolve, reject) => { const r = indexedDB.open("robot-tactics-offline", 1); r.onerror = () => reject(r.error); r.onsuccess = () => { const db = r.result, tx = db.transaction("checkpoints", "readwrite"); tx.objectStore("checkpoints").put(raw, "save"); tx.oncomplete = () => { db.close(); resolve(); }; tx.onabort = () => reject(tx.error); }; }), JSON.stringify(data));
  await page.reload(); await expect(page.getByRole("grid")).toBeVisible(); await page.getByRole("navigation", { name: "戦闘操作" }).getByRole("button", { name: "攻撃", exact: true }).click();
  const ids = before.core.actors.find(a => a.unitIds.length === 3)!.unitIds;
  for (const id of ids) await page.getByRole("grid").locator('g[data-unit-id=' + JSON.stringify(id) + ']').click();
  await expect(page.getByRole("button", { name: "実行", exact: true })).toBeEnabled(); expect((await saved(page)).save).toEqual(data);
  await page.getByRole("button", { name: "実行", exact: true }).click(); await expect.poll(async () => (await saved(page)).save.battle!.sequence).toBe(1);
  expect((await saved(page)).core.units.find(u => u.id === "p1")!.energy).toMatchObject({ action: { kind: "normal-attack", energyCost: 0 }, normalHitRecovered: true });
});
for (const [kind, en] of [["shield", 44], ["normal-railgun", 29]] as const) test(`${kind} low-EN checkpoint disables execution and preserves saved state`, async ({ page, context }) => {
  await start(page, context, kind); const before = await saved(page), data = { ...before.save, battle: { ...before.save.battle!, snapshot: { ...before.core, units: before.core.units.map(u => u.id === "p1" ? { ...u, energy: { ...u.energy, en } } : u) } } };
  const raw = JSON.stringify(data);
  await page.evaluate(raw => new Promise<void>((resolve, reject) => { const r = indexedDB.open("robot-tactics-offline", 1); r.onerror = () => reject(r.error); r.onsuccess = () => { const db = r.result, tx = db.transaction("checkpoints", "readwrite"); tx.objectStore("checkpoints").put(raw, "save"); tx.oncomplete = () => { db.close(); resolve(); }; tx.onabort = () => reject(tx.error); }; }), raw);
  await page.reload(); await expect(page.getByRole("grid")).toBeVisible(); await page.getByRole("navigation", { name: "戦闘操作" }).getByRole("button", { name: kind === "shield" ? "特殊" : "攻撃", exact: true }).click();
  await expect(page.getByText("EN不足", { exact: true })).toBeVisible(); await expect(page.getByRole("button", { name: "実行", exact: true })).toBeDisabled(); expect((await saved(page)).save).toEqual(data);
});

for (const [kind, family, range, cost] of [["normal-thrust", "thrust", "1〜2", 0], ["normal-sniper", "sniper", "3〜6", 0], ["normal-railgun", "sniper", "3〜5", 30]] as const) test(`${kind} taps one legal target, saves real damage/EN once and resumes/retries offline`, async ({ page, context }) => {
  await start(page, context, kind); const before = await saved(page), source = before.core.units.find(u => u.id === "p1")!, target = before.core.units.find(u => u.id === "enemy-supreme-commander")!;
  await page.getByRole("navigation", { name: "戦闘操作" }).getByRole("button", { name: "攻撃", exact: true }).click();
  await expect(page.getByLabel("行動の種類", { exact: true }).locator("option:checked")).toContainText(`射程${range}・EN${cost}`);
  await expect(page.getByRole("button", { name: "実行", exact: true })).toBeDisabled(); await selectNormalTarget(page);
  expect((await saved(page)).save).toEqual(before.save); await expect(page.locator(".damage-number")).toHaveCount(0);
  await page.getByRole("button", { name: "実行", exact: true }).click(); await expect.poll(async () => (await saved(page)).save.battle!.sequence).toBe(1); await page.clock.runFor(801);
  const after = await saved(page), attacker = after.core.units.find(u => u.id === "p1")!, enemy = after.core.units.find(u => u.id === target.id)!;
  expect(after.core.latest!.damage).toHaveLength(1); expect(enemy.hp).toBe(target.hp - after.core.latest!.damage[0]!.damage!); expect((await hits(page)).map(h => h.kind)).toEqual([family]);
  expect(attacker.hp).toBe(source.hp); expect(attacker.stats).toEqual(source.stats); expect(attacker.energy.action).toEqual({ kind: "normal-attack", energyCost: cost }); expect(attacker.energy.normalHitRecovered).toBe(cost === 0);
  const normalRecovery = cost === 0 ? 6 + Math.floor(source.energy.maxEn * 0.025) + 8 : 0;
  expect(attacker.energy.en).toBe(Math.min(source.energy.maxEn, source.energy.en - cost + normalRecovery + 4 + Math.floor(source.energy.maxEn * 0.025)));
  expect(after.core.actionIds.length - before.core.actionIds.length).toBe(1); expect(after.save.progress).toEqual(before.save.progress); expect(after.core.turn.actorId).toBe("p2");
  await page.reload(); await expect(page.getByRole("grid")).toBeVisible(); await page.clock.runFor(1000); expect((await saved(page)).save).toEqual(after.save); await expect(page.locator(".robot-battle-fx")).toHaveCount(0);
  await page.getByRole("button", { name: "オプション", exact: true }).click(); page.once("dialog", d => d.accept()); await page.getByRole("button", { name: "再挑戦", exact: true }).click(); await expect.poll(async () => (await saved(page)).save.battle!.sequence).toBe(0);
  const retry = await saved(page); expect(retry.core.units).toEqual(before.core.units); expect(retry.save.battle!.departure.party).toEqual(before.save.battle!.departure.party);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight)).toBe(true);
});
test("failed railgun save publishes no target damage or EN cost and retries one shot", async ({ page, context }) => {
  await start(page, context, "normal-railgun"); const before = await saved(page);
  await page.getByRole("navigation", { name: "戦闘操作" }).getByRole("button", { name: "攻撃", exact: true }).click(); await selectNormalTarget(page);
  await page.evaluate(() => { const original = IDBObjectStore.prototype.put; IDBObjectStore.prototype.put = function() { IDBObjectStore.prototype.put = original; throw new DOMException("保存領域不足", "QuotaExceededError"); }; });
  await page.getByRole("button", { name: "実行", exact: true }).click(); await expect(page.getByRole("alert").last()).toBeVisible(); expect((await saved(page)).save).toEqual(before.save); expect(await hits(page)).toEqual([]);
  await page.getByRole("button", { name: "実行", exact: true }).click(); await expect.poll(async () => (await saved(page)).save.battle!.sequence).toBe(1); const after = await saved(page);
  expect(after.core.latest!.damage).toHaveLength(1); expect(after.core.units.find(u => u.id === "p1")!.energy.action).toEqual({ kind: "normal-attack", energyCost: 30 }); expect(after.core.actionIds.length - before.core.actionIds.length).toBe(1);
});

for (const [kind, text, modifiers] of [
  ["normal-pistol", "SPD-8", [{ stat: "spd", delta: -8 }]],
  ["normal-assault", "近攻-10・射攻-10", [{ stat: "melee", delta: -10 }, { stat: "ranged", delta: -10 }]],
  ["normal-corrosion", "DEF-8", [{ stat: "def", delta: -8 }]],
  ["normal-emp", "EN25減少", undefined],
  ["normal-binding", "MOV-1", [{ stat: "mov", delta: -1 }]]
] as const) test(`${kind} saves real on-hit effect, resumes into target turn, expires once and retries offline`, async ({ page, context }) => {
  await start(page, context, kind); const before = await saved(page), target = before.core.units.find(u => u.id === "enemy-supreme-commander")!, source = before.core.units.find(u => u.id === "p1")!;
  await page.getByRole("navigation", { name: "戦闘操作" }).getByRole("button", { name: "攻撃", exact: true }).click(); await page.getByRole("grid").locator('g[data-unit-id="enemy-supreme-commander"]').click();
  expect((await saved(page)).save).toEqual(before.save); await expect(page.locator(".damage-number")).toHaveCount(0);
  await page.getByRole("button", { name: "実行", exact: true }).click(); await expect.poll(async () => (await saved(page)).save.battle!.sequence).toBe(1);
  const hit = await saved(page), affected = hit.core.units.find(u => u.id === target.id)!, attacker = hit.core.units.find(u => u.id === "p1")!;
  expect(affected.hp).toBe(target.hp - hit.core.latest!.damage[0]!.damage!); expect(affected.weaponDebuffs).toEqual(modifiers); expect(affected.stats).toEqual(target.stats);
  expect(affected.energy.en).toBe(target.energy.en + 3 - (kind === "normal-emp" ? 25 : 0)); expect(hit.core.turn.actorId).toBe(target.id); expect(hit.core.latest!.damage).toHaveLength(1);
  expect(attacker.hp).toBe(source.hp); expect(attacker.energy.normalHitRecovered).toBe(true); expect(attacker.energy.action).toEqual({ kind: "normal-attack", energyCost: 0 });
  await expect(page.getByRole("region", { name: "サマリー" })).toContainText(text);
  await page.reload(); await expect(page.getByRole("grid")).toBeVisible(); expect((await saved(page)).save).toEqual(hit.save); await expect(page.locator(".robot-battle-fx")).toHaveCount(0);
  await page.clock.runFor(1700); await expect.poll(async () => (await saved(page)).save.battle!.sequence).toBe(2);
  const ended = await saved(page), after = ended.core.units.find(u => u.id === target.id)!;
  expect(after.weaponDebuffs).toBeUndefined(); expect(after.stats).toEqual(target.stats); expect(after.hp).toBe(affected.hp); expect(ended.core.turn.actorId).toBe("p2"); expect(ended.save.progress).toEqual(before.save.progress);
  expect(after.energy.en).toBe(Math.min(after.energy.maxEn, affected.energy.en + 4 + Math.floor(after.energy.maxEn * 0.025)));
  await page.reload(); await expect(page.getByRole("grid")).toBeVisible(); await page.clock.runFor(1700); expect((await saved(page)).save).toEqual(ended.save);
  await page.getByRole("button", { name: "オプション", exact: true }).click(); page.once("dialog", d => d.accept()); await page.getByRole("button", { name: "再挑戦", exact: true }).click(); await expect.poll(async () => (await saved(page)).save.battle!.sequence).toBe(0);
  expect((await saved(page)).core.units).toEqual(before.core.units); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight)).toBe(true);
});
for (const kind of ["normal-corrosion", "normal-emp"] as const) test(`${kind} failed save publishes neither damage nor effect and retry commits both once`, async ({ page, context }) => {
  await start(page, context, kind); const before = await saved(page);
  await page.getByRole("navigation", { name: "戦闘操作" }).getByRole("button", { name: "攻撃", exact: true }).click(); await page.getByRole("grid").locator('g[data-unit-id="enemy-supreme-commander"]').click();
  await page.evaluate(() => { const original = IDBObjectStore.prototype.put; IDBObjectStore.prototype.put = function() { IDBObjectStore.prototype.put = original; throw new DOMException("保存領域不足", "QuotaExceededError"); }; });
  await page.getByRole("button", { name: "実行", exact: true }).click(); await expect(page.getByRole("alert").last()).toBeVisible(); expect((await saved(page)).save).toEqual(before.save); expect(await hits(page)).toEqual([]);
  await page.getByRole("button", { name: "実行", exact: true }).click(); await expect.poll(async () => (await saved(page)).save.battle!.sequence).toBe(1); const after = await saved(page), target = after.core.units.find(u => u.id === "enemy-supreme-commander")!;
  if (kind === "normal-corrosion") expect(target.weaponDebuffs).toEqual([{ stat: "def", delta: -8 }]); else expect(target.energy.en).toBe(before.core.units.find(u => u.id === target.id)!.energy.en + 3 - 25);
  expect(after.core.actionIds.length - before.core.actionIds.length).toBe(1); expect(after.core.latest!.damage).toHaveLength(1);
});

async function selectBoundMove(page: Page) {
  await page.getByRole("navigation", { name: "戦闘操作" }).getByRole("button", { name: "移動", exact: true }).click();
  const cell = page.getByRole("grid").locator("g[data-cell]:has(.legal-cell)").first(), name = await cell.getAttribute("data-cell");
  const match = name!.match(/^([A-Z]+)([0-9]+)$/)!;
  const destination = { x: [...match[1]!].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1, y: Number(match[2]) - 1 };
  await expect(page.getByRole("button", { name: "実行", exact: true })).toBeDisabled(); await cell.click(); return destination;
}
test("binding movement uses legal cell taps, saves mid-turn, resumes once and clears MOV loss at wait", async ({ page, context }) => {
  await start(page, context, "binding-movement"); const before = await saved(page), source = before.core.units.find(u => u.id === "p1")!; expect(source.weaponDebuffs).toEqual([{ stat: "mov", delta: -1 }]);
  const destination = await selectBoundMove(page); expect((await saved(page)).save).toEqual(before.save); await expect(page.locator(".damage-number")).toHaveCount(0);
  await page.getByRole("button", { name: "実行", exact: true }).click(); await expect.poll(async () => (await saved(page)).save.battle!.sequence).toBe(1); await page.clock.runFor(801);
  const moved = await saved(page), u = moved.core.units.find(u => u.id === "p1")!; expect(u.position).toEqual(destination); expect(u.weaponDebuffs).toEqual(source.weaponDebuffs); expect(u.stats).toEqual(source.stats); expect(u.movement).toEqual(source.movement);
  expect(u.energy.en).toBe(Math.min(u.energy.maxEn, source.energy.en + 3)); expect(u.energy.moved).toBe(true); expect(u.energy.action).toBeNull(); expect(moved.core.turn.actorId).toBe("p1"); expect(moved.core.latest!.damage).toEqual([]);
  await page.reload(); await expect(page.getByRole("grid")).toBeVisible(); expect((await saved(page)).save).toEqual(moved.save);
  await page.getByRole("navigation", { name: "戦闘操作" }).getByRole("button", { name: "移動", exact: true }).click(); await expect(page.getByText("移動済み", { exact: true })).toBeVisible(); await expect(page.getByRole("button", { name: "実行", exact: true })).toBeDisabled();
  await page.getByRole("navigation", { name: "戦闘操作" }).getByRole("button", { name: "待機", exact: true }).click(); await page.getByRole("button", { name: "実行", exact: true }).click(); await expect.poll(async () => (await saved(page)).save.battle!.sequence).toBe(2); await page.clock.runFor(801);
  const ended = await saved(page); expect(ended.core.units.find(u => u.id === "p1")!.weaponDebuffs).toBeUndefined(); expect(ended.core.units.find(u => u.id === "p1")!.stats).toEqual(source.stats); expect(ended.core.turn.actorId).toBe("p2"); expect(ended.save.progress).toEqual(before.save.progress);
  await page.reload(); await expect(page.getByRole("grid")).toBeVisible(); expect((await saved(page)).save).toEqual(ended.save);
  await page.getByRole("button", { name: "オプション", exact: true }).click(); page.once("dialog", d => d.accept()); await page.getByRole("button", { name: "再挑戦", exact: true }).click(); await expect.poll(async () => (await saved(page)).save.battle!.sequence).toBe(0); expect((await saved(page)).core.units).toEqual(before.core.units);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight)).toBe(true);
});
test("failed weakened move checkpoint preserves position/EN and retries exactly one EN3 recovery", async ({ page, context }) => {
  await start(page, context, "binding-movement"); const before = await saved(page), source = before.core.units.find(u => u.id === "p1")!, destination = await selectBoundMove(page);
  await page.evaluate(() => { const original = IDBObjectStore.prototype.put; IDBObjectStore.prototype.put = function() { IDBObjectStore.prototype.put = original; throw new DOMException("保存領域不足", "QuotaExceededError"); }; });
  await page.getByRole("button", { name: "実行", exact: true }).click(); await expect(page.getByRole("alert").last()).toBeVisible(); expect((await saved(page)).save).toEqual(before.save); expect(await hits(page)).toEqual([]);
  await page.getByRole("button", { name: "実行", exact: true }).click(); await expect.poll(async () => (await saved(page)).save.battle!.sequence).toBe(1); const moved = await saved(page), u = moved.core.units.find(u => u.id === "p1")!;
  expect(u.position).toEqual(destination); expect(u.energy.en).toBe(Math.min(u.energy.maxEn, source.energy.en + 3)); expect(u.weaponDebuffs).toEqual(source.weaponDebuffs); expect(moved.core.actionIds.length - before.core.actionIds.length).toBe(1); expect(moved.core.turn.actorId).toBe("p1");
});

function areaEnemies(core: RobotBattleCoreState, diagonal = false) {
  const center = core.units.find(u => u.id === "enemy-supreme-commander")!;
  return core.units.filter(u => u.id !== center.id && u.kind !== "controlled" && u.kind !== "friendly-ai" && u.hp > 0 && u.position && (diagonal ? Math.max(Math.abs(u.position.x - center.position!.x), Math.abs(u.position.y - center.position!.y)) === 1 : Math.abs(u.position.x - center.position!.x) + Math.abs(u.position.y - center.position!.y) === 1));
}
async function mapUnitTap(page: Page, id: string) { const cell = page.getByRole("grid").locator('g[data-unit-id=' + JSON.stringify(id) + ']'); if (test.info().project.name === "mobile") await cell.tap(); else await cell.click(); }
async function chooseBurst(page: Page) { await page.getByRole("navigation", { name: "戦闘操作" }).getByRole("button", { name: "攻撃", exact: true }).click(); await page.getByLabel("行動の種類", { exact: true }).selectOption("burst"); await page.getByRole("button", { name: "俯瞰", exact: true }).click(); await mapUnitTap(page, "enemy-supreme-commander"); }

test("blast chooses center then up to two neighbors, toggles/reselects/cancels and only confirm fires", async ({ page, context }) => {
  await start(page, context, "area-burst"); const before = await saved(page), ids = areaEnemies(before.core).map(u => u.id);
  await chooseBurst(page); expect((await saved(page)).save).toEqual(before.save); await expect(page.getByRole("grid").locator(".blast-area-cell")).toHaveCount(4); await expect(page.getByRole("grid").locator('[data-blast-role="center"]')).toHaveCount(1); await expect(page.getByRole("button", { name: "決定", exact: true })).toBeEnabled(); await expect(page.locator(".damage-number")).toHaveCount(0);
  await mapUnitTap(page, ids[0]!); await mapUnitTap(page, ids[1]!); await expect(page.getByRole("grid").locator(".selected-cell")).toHaveCount(3); await mapUnitTap(page, ids[2]!); await expect(page.getByRole("grid").locator(".selected-cell")).toHaveCount(3);
  await mapUnitTap(page, ids[1]!); await expect(page.getByRole("grid").locator(".selected-cell")).toHaveCount(2);
  await page.getByRole("button", { name: "中心を選び直す", exact: true }).click(); await expect(page.getByRole("grid").locator(".blast-area-cell")).toHaveCount(0); await expect(page.getByRole("button", { name: "決定", exact: true })).toBeDisabled();
  await mapUnitTap(page, "enemy-supreme-commander"); await page.getByRole("button", { name: "キャンセル", exact: true }).click(); await expect(page.getByRole("grid").locator(".blast-area-cell")).toHaveCount(0); expect((await saved(page)).save).toEqual(before.save);
  await page.getByRole("navigation", { name: "戦闘操作" }).getByRole("button", { name: "攻撃", exact: true }).click(); await page.getByLabel("行動の種類", { exact: true }).selectOption("burst"); await mapUnitTap(page, "enemy-supreme-commander"); await mapUnitTap(page, ids[0]!); await mapUnitTap(page, ids[1]!);
  expect((await saved(page)).save).toEqual(before.save); await page.getByRole("button", { name: "決定", exact: true }).click(); await expect.poll(async () => (await saved(page)).save.battle!.sequence).toBe(1); await page.clock.runFor(550);
  const after = await saved(page); expect(after.core.latest!.damage.map(d => d.targetId)).toEqual(["enemy-supreme-commander", ids[0], ids[1]]); expect((await hits(page)).map(h => h.kind)).toEqual(["blast", "blast", "blast"]); expect((await hits(page)).every(h => h.pulse === 0)).toBe(true);
  for (const id of ids.slice(2)) expect(after.core.units.find(u => u.id === id)!.hp).toBe(before.core.units.find(u => u.id === id)!.hp); expect(after.core.units.find(u => u.id === "p1")!.hp).toBe(before.core.units.find(u => u.id === "p1")!.hp); expect(after.save.progress).toEqual(before.save.progress);
  await page.reload(); await expect(page.getByRole("grid")).toBeVisible(); expect((await saved(page)).save).toEqual(after.save); await expect(page.locator(".robot-battle-fx")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight)).toBe(true);
});
test("blast center alone is confirmed without auto-hitting any neighbor", async ({ page, context }) => {
  await start(page, context, "area-burst"); const before = await saved(page); await chooseBurst(page); await page.getByRole("button", { name: "決定", exact: true }).click(); await expect.poll(async () => (await saved(page)).save.battle!.sequence).toBe(1); const after = await saved(page); expect(after.core.latest!.damage.map(d => d.targetId)).toEqual(["enemy-supreme-commander"]); for (const u of areaEnemies(before.core, true)) expect(after.core.units.find(v => v.id === u.id)!.hp).toBe(u.hp);
});
test("wide blast previews eight cells, selects diagonal enemy beyond firing range and excludes friendly/unselected cells", async ({ page, context }) => {
  await start(page, context, "area-wide"); const before = await saved(page), center = before.core.units.find(u => u.id === "enemy-supreme-commander")!, all = areaEnemies(before.core, true), diagonal = all.find(u => u.position!.x !== center.position!.x && u.position!.y !== center.position!.y)!, other = areaEnemies(before.core)[0]!;
  await chooseBurst(page); await expect(page.getByRole("grid").locator(".blast-area-cell")).toHaveCount(8); await mapUnitTap(page, "p2"); await expect(page.getByRole("grid").locator(".selected-cell")).toHaveCount(1); await mapUnitTap(page, diagonal.id); await mapUnitTap(page, other.id); await page.getByRole("button", { name: "決定", exact: true }).click(); await expect.poll(async () => (await saved(page)).save.battle!.sequence).toBe(1);
  const after = await saved(page); expect(new Set(after.core.latest!.damage.map(d => d.targetId))).toEqual(new Set([center.id, diagonal.id, other.id])); expect(after.core.units.find(u => u.id === "p2")!.hp).toBe(before.core.units.find(u => u.id === "p2")!.hp);
});
test("blast-family normal mode confirms one 100-percent target and never opens area selection", async ({ page, context }) => {
  await start(page, context, "area-normal"); const before = await saved(page); await page.getByRole("navigation", { name: "戦闘操作" }).getByRole("button", { name: "攻撃", exact: true }).click(); await page.getByRole("button", { name: "俯瞰", exact: true }).click(); await mapUnitTap(page, "enemy-supreme-commander"); await mapUnitTap(page, "enemy-supreme-commander"); expect((await saved(page)).save).toEqual(before.save); await expect(page.getByRole("grid").locator(".blast-area-cell")).toHaveCount(0); await page.getByRole("button", { name: "実行", exact: true }).click(); await expect.poll(async () => (await saved(page)).save.battle!.sequence).toBe(1); expect((await saved(page)).core.latest!.damage).toHaveLength(1);
});
for (const kind of ["area-spread", "area-railgun"]) test(`${kind} one touch fires all neighbors immediately with no confirm/preview and one EN50 receipt`, async ({ page, context }) => {
  await start(page, context, kind); const before = await saved(page), expectedIds = ["enemy-supreme-commander", ...areaEnemies(before.core, true).map(u => u.id)]; await page.getByRole("navigation", { name: "戦闘操作" }).getByRole("button", { name: "攻撃", exact: true }).click();
  await expect(page.getByRole("button", { name: /^(実行|決定)$/ })).toHaveCount(0); await expect(page.getByRole("grid").locator(".blast-area-cell,.spread-action-area")).toHaveCount(0); await page.getByRole("button", { name: "俯瞰", exact: true }).click(); await mapUnitTap(page, "enemy-supreme-commander"); await expect.poll(async () => (await saved(page)).save.battle!.sequence).toBe(1); await page.clock.runFor(550);
  const after = await saved(page), own = after.core.units.find(u => u.id === "p1")!; expect(new Set(after.core.latest!.damage.map(d => d.targetId))).toEqual(new Set(expectedIds)); expect(expectedIds.length).toBeGreaterThan(3); expect(own.energy.action).toEqual({ kind: "other", energyCost: 50 }); expect(own.energy.normalHitRecovered).toBe(false); expect(own.stats).toEqual(before.core.units.find(u => u.id === "p1")!.stats); expect(after.save.progress).toEqual(before.save.progress);
  await expect(page.getByRole("grid").locator(".spread-action-area")).toHaveCount(9); expect((await hits(page)).every(h => h.kind === "special:spread-shot" && h.pulse === 0)).toBe(true); expect(await hits(page)).toHaveLength(expectedIds.length);
  await mapUnitTap(page, "enemy-supreme-commander"); expect((await saved(page)).save).toEqual(after.save); await page.reload(); await expect(page.getByRole("grid")).toBeVisible(); await page.clock.runFor(1000); expect((await saved(page)).save).toEqual(after.save); await expect(page.getByRole("grid").locator(".spread-action-area,.robot-battle-fx")).toHaveCount(0);
  await page.getByRole("button", { name: "オプション", exact: true }).click(); page.once("dialog", d => d.accept()); await page.getByRole("button", { name: "再挑戦", exact: true }).click(); await expect.poll(async () => (await saved(page)).save.battle!.sequence).toBe(0); expect((await saved(page)).core.units).toEqual(before.core.units); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight)).toBe(true);
});
for (const kind of ["area-burst", "area-spread"] as const) test(`${kind} failed save shows no partial HP/EN/effect and retries its adopted execution flow once`, async ({ page, context }) => {
  await start(page, context, kind); const before = await saved(page); if (kind === "area-burst") { await chooseBurst(page); await mapUnitTap(page, areaEnemies(before.core)[0]!.id); } else { await page.getByRole("navigation", { name: "戦闘操作" }).getByRole("button", { name: "攻撃", exact: true }).click(); await page.getByRole("button", { name: "俯瞰", exact: true }).click(); }
  await page.evaluate(() => { const original = IDBObjectStore.prototype.put; IDBObjectStore.prototype.put = function() { IDBObjectStore.prototype.put = original; throw new DOMException("保存領域不足", "QuotaExceededError"); }; });
  if (kind === "area-burst") await page.getByRole("button", { name: "決定", exact: true }).click(); else await mapUnitTap(page, "enemy-supreme-commander"); await expect(page.getByRole("alert").last()).toBeVisible(); expect((await saved(page)).save).toEqual(before.save); expect(await hits(page)).toEqual([]); await expect(page.getByRole("grid").locator(".spread-action-area")).toHaveCount(0);
  if (kind === "area-burst") await page.getByRole("button", { name: "決定", exact: true }).click(); else await mapUnitTap(page, "enemy-supreme-commander"); await expect.poll(async () => (await saved(page)).save.battle!.sequence).toBe(1); const after = await saved(page); expect(after.core.latest!.damage).toHaveLength(kind === "area-burst" ? 2 : 6); expect(after.core.actionIds.length - before.core.actionIds.length).toBe(1);
});
test("spread EN49, empty and friendly taps never commit or create minimum-one damage", async ({ page, context }) => {
  await start(page, context, "area-spread"); const before = await saved(page), data = { ...before.save, battle: { ...before.save.battle!, snapshot: { ...before.core, units: before.core.units.map(u => u.id === "p1" ? { ...u, energy: { ...u.energy, en: 49 } } : u) } } };
  await page.evaluate(raw => new Promise<void>((resolve, reject) => { const r = indexedDB.open("robot-tactics-offline", 1); r.onerror = () => reject(r.error); r.onsuccess = () => { const db = r.result, tx = db.transaction("checkpoints", "readwrite"); tx.objectStore("checkpoints").put(raw, "save"); tx.oncomplete = () => { db.close(); resolve(); }; tx.onabort = () => reject(tx.error); }; }), JSON.stringify(data));
  await page.reload(); await expect(page.getByRole("grid")).toBeVisible(); await page.getByRole("navigation", { name: "戦闘操作" }).getByRole("button", { name: "攻撃", exact: true }).click(); await expect(page.getByText("EN不足", { exact: true })).toBeVisible(); await page.getByRole("button", { name: "俯瞰", exact: true }).click(); await mapUnitTap(page, "enemy-supreme-commander"); await mapUnitTap(page, "p2");
  const center = before.core.units.find(u => u.id === "enemy-supreme-commander")!.position!, emptyCell = String.fromCharCode(64 + center.x) + center.y;
  const cell = page.getByRole("grid").locator('g[data-cell=' + JSON.stringify(emptyCell) + ']'); if (test.info().project.name === "mobile") await cell.tap(); else await cell.click();
  expect((await saved(page)).save).toEqual(data); expect(await hits(page)).toEqual([]); await expect(page.getByRole("grid").locator(".legal-cell,.spread-action-area")).toHaveCount(0);
});


test("real heavy hammer knockback plays after impact and travels with the original target sprite", async ({ page, context }) => {
  await start(page, context, "normal-knockback");
  const before = await saved(page), source = before.core.units.find(u => u.id === "p1")!,
    oldTarget = before.core.units.find(u => u.id === "enemy-supreme-commander")!;
  await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now() + 1000)));
  await page.getByRole("navigation", { name: "戦闘操作" }).getByRole("button", { name: "攻撃", exact: true }).click();
  await selectNormalTarget(page);
  await page.getByRole("button", { name: "実行", exact: true }).click();
  await expect.poll(async () => (await saved(page)).save.battle!.sequence).toBe(1);
  const after = await saved(page), target = after.core.units.find(u => u.id === "enemy-supreme-commander")!;
  expect(Math.max(Math.abs(target.position!.x - oldTarget.position!.x), Math.abs(target.position!.y - oldTarget.position!.y))).toBe(1);
  expect(target.hp).toBeLessThan(oldTarget.hp);
  expect(after.core.units.find(u=>u.id==="p1")!.position).toEqual(source.position);
  const sprite = page.getByRole("grid").locator('[data-unit-visual="enemy-supreme-commander"]');
  await expect(sprite).toHaveAttribute("data-motion-style","push");
  const held = await sprite.getAttribute("transform");
  expect(held).toMatch(/^translate\(/);
  await page.clock.runFor(200);
  expect(await sprite.getAttribute("transform")).toBe(held); // No knockback before the hit.
  await page.clock.runFor(930);
  const shifted = await sprite.getAttribute("transform");
  expect(shifted).not.toBe(held);
  await page.clock.runFor(800);
  await expect(page.getByRole("grid").locator('[data-unit-visual="enemy-supreme-commander"]')).not.toHaveAttribute("data-motion-style","push");
  expect(await saved(page)).toEqual(after);
  await page.reload();
  await expect(page.getByRole("grid").locator('[data-motion-style="push"]')).toHaveCount(0);
  expect(await saved(page)).toEqual(after);
});


test("real knockback interruption snaps the target to saved destination and does not replay the hit", async ({ page, context }) => {
  await start(page, context, "normal-knockback");
  await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now() + 1000)));
  const before = await saved(page);
  await page.getByRole("navigation", { name: "戦闘操作" }).getByRole("button", { name: "攻撃", exact: true }).click();
  await selectNormalTarget(page);
  await page.getByRole("button", { name: "実行", exact: true }).click();
  await expect.poll(async () => (await saved(page)).save.battle!.sequence).toBe(1);
  const savedAfter = await saved(page), target = savedAfter.core.units.find(u=>u.id==="enemy-supreme-commander")!;
  await page.clock.runFor(1050);
  await expect(page.getByRole("grid").locator('[data-motion-style="push"]')).toHaveCount(1);
  await page.getByRole("button", { name: "演出速度：標準" }).click();
  await expect(page.getByRole("grid").locator('[data-motion-style="push"]')).toHaveCount(0);
  await expect(page.getByRole("grid").locator('[data-unit-visual="enemy-supreme-commander"]')).not.toHaveAttribute("transform", /translate/);
  expect(await saved(page)).toEqual(savedAfter);
  await page.reload();
  await expect(page.getByRole("grid").locator('[data-motion-style="push"]')).toHaveCount(0);
  expect(await saved(page)).toEqual(savedAfter);
  expect(target.position).not.toEqual(before.core.units.find(u=>u.id==="enemy-supreme-commander")!.position);
});
