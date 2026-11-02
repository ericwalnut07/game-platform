import { isDeepStrictEqual } from "node:util";
import { expect, test, type Page } from "@playwright/test";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import type { RobotOfflineSave } from "../../src/games/robot-tactics/offlineSession";
import { decodeRobotBattleCore, getRobotBattleActor, getRobotBattleUnit } from "../../src/games/robot-tactics/battleState";
import { robotFormalBattleAdapter } from "../../src/client/games/robot-tactics/FormalBattleAdapter";
import { formalPlayerAction } from "./formalPlayerController";

const url = pathToFileURL(resolve("dist/robot-tactics-offline/index.html")).href;
async function saved(page: Page): Promise<RobotOfflineSave> {
  const raw = await page.evaluate(() => new Promise<string>((resolve, reject) => {
    const request = indexedDB.open("robot-tactics-offline", 1); request.onerror = () => reject(request.error);
    request.onsuccess = () => { const db = request.result, tx = db.transaction("checkpoints"), read = tx.objectStore("checkpoints").get("save"); read.onerror = () => reject(read.error); read.onsuccess = () => { db.close(); resolve(read.result as string); }; };
  }));
  return JSON.parse(raw) as RobotOfflineSave;
}
async function depart(page: Page) {
  await page.getByRole("button", { name: "ミッション選択", exact: true }).click();
  const mission = page.getByRole("button", { name: /^M01 / });
  if (await mission.getAttribute("aria-expanded") !== "true") await mission.click();
  await page.getByRole("button", { name: "Easy", exact: true }).click();
  await expect(page.getByRole("grid", { name: "戦場マップ", exact: true })).toBeVisible();
}
async function controlled(page: Page) {
  for (let n = 0; n < 15; n++) {
    const save = await saved(page);
    if (!save.battle) return;
    const s = decodeRobotBattleCore(save.battle.snapshot), actor = getRobotBattleActor(s);
    if (getRobotBattleUnit(s, actor.unitIds[0]!).kind === "controlled") return;
    await page.clock.runFor(1200);
    await expect.poll(async () => (await saved(page)).revision).toBeGreaterThan(save.revision);
  }
  throw new Error("NPC turns did not reach a controlled turn");
}
test("production M01 departure, no-light-EN inspection, durable action, reload and retry", async ({ page, context }) => {
  await context.setOffline(true); await page.clock.install(); await page.goto(url); await depart(page); await controlled(page);
  const before = await saved(page), model = robotFormalBattleAdapter.project(before.battle!);
  const light = decodeRobotBattleCore(before.battle!.snapshot).units.find(u => u.kind === "light")!;
  await page.getByRole("button", { name: "俯瞰", exact: true }).click();
  const tile = page.getByRole("grid").locator(`g[data-cell="${String.fromCharCode(65 + light.position!.x)}${light.position!.y + 1}"]`);
  await tile.click(); await tile.click();
  const summary = page.getByRole("region", { name: "サマリー" });
  await expect(summary).toContainText(light.name); await expect(summary.getByLabel("EN", { exact: true })).toHaveCount(0);
  expect(await saved(page)).toEqual(before);
  const defend = model.commands.find(c => c.id === "defend")!;
  await page.getByRole("navigation", { name: "戦闘操作" }).getByRole("button", { name: "特殊", exact: true }).click();
  await page.getByLabel("行動の種類", { exact: true }).selectOption(defend.id);
  await page.getByRole("button", { name: "実行", exact: true }).click();
  await expect.poll(async () => (await saved(page)).battle!.sequence).toBeGreaterThan(before.battle!.sequence);
  await page.getByRole("button", { name: "オプション", exact: true }).click();
  const paused = await saved(page); await page.reload();
  await expect(page.getByRole("grid", { name: "戦場マップ", exact: true })).toBeVisible();
  expect((await saved(page)).battle!.departure).toEqual(paused.battle!.departure);
  await page.getByRole("button", { name: "オプション", exact: true }).click();
  page.once("dialog", d => d.accept()); await page.getByRole("button", { name: "再挑戦", exact: true }).click();
  await expect.poll(async () => (await saved(page)).battle!.departure.battleId).not.toBe(before.battle!.departure.battleId);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test("production M01 can clear through real PC/mobile map operations and persist EXP/unlocks", async ({ page, context }, testInfo) => {
  await context.setOffline(true); await page.clock.install(); await page.goto(url);
  // Only ordinary UI equipment changes to initially owned Lv1 parts. No seed,
  // save injection, fixture runtime, fixed NPC turn or fabricated HP/EN.
  await page.getByRole("button", { name: "機体カスタマイズ", exact: true }).click();
  for (const name of ["コアA", "コアB", "コアC"]) {
    await page.getByRole("button", { name: new RegExp("^" + name + " ·") }).click();
    await page.getByRole("navigation", { name: "装備カテゴリー", exact: true }).getByRole("button", { name: "武器②", exact: true }).click();
    await page.getByRole("button", { name: /^アサルトライフル · 共有Lv/ }).click();
    await page.getByRole("button", { name: "装備する", exact: true }).click();
    await page.getByRole("button", { name: "3コア一覧へ", exact: true }).click();
  }
  await page.getByRole("button", { name: "ホーム", exact: true }).click(); await depart(page);
  for (let i = 0; i < 150; i++) {
    await controlled(page);
    const save = await saved(page); if (!save.battle) break;
    const s = decodeRobotBattleCore(save.battle.snapshot), action = formalPlayerAction(s), model = robotFormalBattleAdapter.project(save.battle);
    const choice = model.choices.find(c => isDeepStrictEqual(c.payload, action));
    if (!choice) throw new Error("Player test controller returned an unexposed action: " + JSON.stringify(action));
    const command = model.commands.find(c => c.id === choice.commandId)!;
    await page.getByRole("navigation", { name: "戦闘操作" }).getByRole("button", { name: ({ move: "移動", attack: "攻撃", special: "特殊", formation: "連携", wait: "待機" })[command.category], exact: true }).click();
    await page.getByLabel("行動の種類", { exact: true }).selectOption(command.id);
    const cells = choice.selection.destination ? [choice.selection.destination] : choice.selection.targetIds.map(id => model.units.find(u => u.id === id)!.cell);
    for (const cell of cells) {
      const overview = page.getByRole("button", { name: "俯瞰", exact: true });
      if (await overview.count()) await overview.click();
      const tile = page.getByRole("grid").locator(`g[data-cell="${String.fromCharCode(65 + cell.x)}${cell.y + 1}"]`);
      if (testInfo.project.name === "mobile") { await tile.tap(); await tile.tap(); } else { await tile.click(); await tile.click(); }
    }
    await page.getByRole("button", { name: "実行", exact: true }).click();
    await expect.poll(async () => (await saved(page)).revision).toBeGreaterThan(save.revision);
  }
  const result = await saved(page);
  expect(result.result).toMatchObject({ result: "won", endedRound: 5, expGained: 80 });
  expect(result.progress.cleared).toContain("easy-01"); expect(result.progress.exp).toBe(80);
  await expect(page.getByText(/EXP.*80/).first()).toBeVisible();
  await page.reload(); expect(await saved(page)).toEqual(result);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
