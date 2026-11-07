import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { isDeepStrictEqual } from "node:util";
import { expect, test, type Page } from "@playwright/test";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import type { RobotOfflineSave } from "../../src/games/robot-tactics/offlineSession";

const { decodeRobotBattleCore, getRobotBattleActor, getRobotBattleUnit, robotFormalBattleAdapter, formalPlayerAction, getRobotDeltaOptions, getRobotExtraMoveOptions, getRobotActiveCombatOptions, offlineAddonFixtureProgress, createRobotOfflineSave, applyRobotCustomization } = createRequire(import.meta.url)(resolve("test-results/robot-formal-harness/controller.cjs")) as typeof import("./formalHarness");

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
    await page.clock.runFor(2400);
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
  await page.evaluate(() => {
    const events: { effect: string }[] = []; (window as Window & { vfxEvents?: { effect: string }[] }).vfxEvents = events;
    document.addEventListener("robot-battle-vfx", e => events.push((e as CustomEvent).detail));
  });
  let reviewedHit = false, reviewedDestroy = false;
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
      if (testInfo.project.name !== "desktop") { await tile.tap(); await tile.tap(); } else { await tile.click(); await tile.click(); }
    }
    await page.getByRole("button", { name: "実行", exact: true }).click();
    await expect.poll(async () => (await saved(page)).revision).toBeGreaterThan(save.revision);
    await page.clock.runFor(560);
    const impact = page.locator('[data-vfx="hit_light"], [data-vfx="hit_heavy"]');
    if (!reviewedHit && await impact.count()) {
      mkdirSync("test-results/robot-vfx-review", { recursive: true });
      await page.screenshot({ path: `test-results/robot-vfx-review/${testInfo.project.name}-M01-hit.png` }); reviewedHit = true;
    }
    await page.clock.runFor(250);
    if (!reviewedDestroy && await page.locator('[data-vfx="destroy_small"], [data-vfx="destroy_large"]').count()) {
      mkdirSync("test-results/robot-vfx-review", { recursive: true });
      await page.screenshot({ path: `test-results/robot-vfx-review/${testInfo.project.name}-M01-destroy.png` }); reviewedDestroy = true;
    }
  }
  const effects = await page.evaluate(() => (window as Window & { vfxEvents?: { effect: string }[] }).vfxEvents?.map(e => e.effect) ?? []);
  expect(effects).toContain("assault"); expect(effects).toContain("hit_light"); expect(effects).toContain("destroy_small");
  expect(reviewedHit).toBe(true); expect(reviewedDestroy).toBe(true);
  const result = await saved(page);
  expect(result.result).toMatchObject({ result: "won", endedRound: 5, expGained: 80 });
  expect(result.progress.cleared).toContain("easy-01"); expect(result.progress.exp).toBe(80);
  await expect(page.getByText(/EXP.*80/).first()).toBeVisible();
  await page.reload(); expect(await saved(page)).toEqual(result);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

async function selectMapCell(page: Page, cell: { x: number; y: number }, touch: boolean) {
  const overview = page.getByRole("button", { name: "俯瞰", exact: true }); if (await overview.count()) await overview.click();
  const tile = page.getByRole("grid").locator(`g[data-cell="${String.fromCharCode(65 + cell.x)}${cell.y + 1}"]`);
  if (touch) { await tile.tap(); await tile.tap(); } else { await tile.click(); await tile.click(); }
}
async function chooseCommand(page: Page, category: "move" | "attack" | "special" | "formation", id: string) {
  await page.getByRole("navigation", { name: "戦闘操作" }).getByRole("button", { name: { move: "移動", attack: "攻撃", special: "特殊", formation: "連携" }[category], exact: true }).click();
  await page.getByLabel("行動の種類", { exact: true }).selectOption(id);
}
test("production fresh M01 normal move then extra move spends one action and restores the exact checkpoint", async ({ page, context }, testInfo) => {
  await context.setOffline(true); await page.clock.install(); await page.goto(url); await depart(page);
  for (let n = 0; n < 9; n++) {
    await controlled(page); const save = await saved(page), s = decodeRobotBattleCore(save.battle!.snapshot), source = getRobotBattleUnit(s, s.turn.actorId!);
    if (source.energy.en >= 40) break;
    await chooseCommand(page, "special", "charge"); await page.getByRole("button", { name: "実行", exact: true }).click();
    await expect.poll(async () => (await saved(page)).battle!.sequence).toBeGreaterThan(save.battle!.sequence);
  }
  const before = await saved(page), model = robotFormalBattleAdapter.project(before.battle!), move = model.choices.find(c => c.commandId === "move")!;
  expect(move).toBeDefined(); const sourceId = decodeRobotBattleCore(before.battle!.snapshot).turn.actorId!;
  await chooseCommand(page, "move", "move"); await selectMapCell(page, move.selection.destination!, testInfo.project.name !== "desktop");
  await page.getByRole("button", { name: "実行", exact: true }).click();
  await expect.poll(async () => (await saved(page)).battle!.sequence).toBe(before.battle!.sequence + 1);
  const moved = await saved(page), core = decodeRobotBattleCore(moved.battle!.snapshot), extra = getRobotExtraMoveOptions(core);
  expect(extra.disabledReason).toBeNull(); const destination = extra.moves[0]!.destination;
  await chooseCommand(page, "special", "extra-move"); await selectMapCell(page, destination, testInfo.project.name !== "desktop");
  await page.getByRole("button", { name: "実行", exact: true }).click();
  await expect.poll(async () => (await saved(page)).battle!.sequence).toBe(moved.battle!.sequence + 1);
  await page.getByRole("button", { name: "オプション", exact: true }).click();
  const checkpoint = await saved(page), actor = getRobotBattleUnit(decodeRobotBattleCore(checkpoint.battle!.snapshot), sourceId);
  expect(actor.position).toEqual(destination); expect(actor.energy.usedExtraMove).toBe(true); expect(actor.energy.action).toEqual({ kind: "extra-move", energyCost: 30 });
  await page.reload(); expect(await saved(page)).toEqual(checkpoint); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test("production M01 Delta uses imported earned progression, real support/target taps, VFX and durable team cooldown", async ({ page, context }, testInfo) => {
  // Explicit high-level/unlocked TEST progression via the normal backup importer.
  // Enemy HP, source EN, positions, runtime and AI are never injected/replaced.
  let progress = offlineAddonFixtureProgress();
  for (const partId of ["opening-capacitor", "emergency-capacitor"]) progress = applyRobotCustomization(progress, { kind: "addon-equip", coreId: "core-a", partId });
  await context.setOffline(true); await page.clock.install(); await page.goto(url);
  await page.getByRole("button", { name: "設定", exact: true }).click(); page.once("dialog", d => d.accept());
  await page.getByLabel("バックアップを読み込む", { exact: true }).setInputFiles({ name: "earned-progression-test.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ ...createRobotOfflineSave(), progress })) });
  await expect.poll(async () => (await saved(page)).progress.party[0]!.coreLevel).toBe(41);
  await page.getByRole("button", { name: "ホーム", exact: true }).click(); await depart(page);
  for (let n = 0; n < 6; n++) {
    await controlled(page); const save = await saved(page), model = robotFormalBattleAdapter.project(save.battle!);
    if (model.choices.some(c => c.commandId.startsWith("delta:") && c.selection.targetIds.length === 3)) break;
    await chooseCommand(page, "special", "charge"); await page.getByRole("button", { name: "実行", exact: true }).click();
    await expect.poll(async () => (await saved(page)).battle!.sequence).toBeGreaterThan(save.battle!.sequence);
  }
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  const before = await saved(page), core = decodeRobotBattleCore(before.battle!.snapshot), model = robotFormalBattleAdapter.project(before.battle!);
  const choice = model.choices.find(c => c.commandId.startsWith("delta:") && c.selection.targetIds.length === 3)!; expect(choice).toBeDefined();
  expect(getRobotDeltaOptions(core, (choice.payload as { weaponId: string }).weaponId).energyCost).toBe(75);
  await chooseCommand(page, "formation", choice.commandId);
  for (const id of [...choice.selection.participantIds, ...choice.selection.targetIds]) await selectMapCell(page, model.units.find(u => u.id === id)!.cell, testInfo.project.name !== "desktop");
  await page.getByRole("button", { name: "実行", exact: true }).click();
  await expect.poll(async () => (await saved(page)).battle!.sequence).toBe(before.battle!.sequence + 1);
  await page.clock.runFor(780); const checkpoint = await saved(page), after = decodeRobotBattleCore(checkpoint.battle!.snapshot);
  expect(after.spentFormations).toEqual(["delta"]); expect(getRobotBattleUnit(after, core.turn.actorId!).energy.action).toEqual({ kind: "other", energyCost: 75 });
  for (const id of choice.selection.participantIds) {
    const previous = getRobotBattleUnit(core, id).energy, next = getRobotBattleUnit(after, id).energy;
    // The scheduler may immediately open one supporter's independent turn.
    expect(next.en).toBe(previous.en); expect(next.action).toBeNull();
    expect(next.ownTurn).toBe(previous.ownTurn + (after.turn.actorId === id ? 1 : 0));
    expect(after.turn.actedActorIds).not.toContain(id);
  }
  await expect(page.locator('[data-vfx="link_attack"]')).toHaveCount(3);
  mkdirSync("test-results/robot-vfx-review", { recursive: true }); await page.screenshot({ path: `test-results/robot-vfx-review/${testInfo.project.name}-M01-delta.png` });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.reload(); expect(await saved(page)).toEqual(checkpoint); await expect(page.locator('[data-vfx="link_attack"]')).toHaveCount(0);
});

async function importEarned(page: Page, progress: ReturnType<typeof offlineAddonFixtureProgress>) {
  await page.goto(url); await page.getByRole("button", { name: "設定", exact: true }).click(); page.once("dialog", d => d.accept());
  await page.getByLabel("バックアップを読み込む", { exact: true }).setInputFiles({ name: "battle-adoption-earned-test.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ ...createRobotOfflineSave(), progress })) });
  await expect.poll(async () => (await saved(page)).progress.party[0]!.coreLevel).toBe(41);
  await page.getByRole("button", { name: "ホーム", exact: true }).click(); await depart(page); await page.clock.pauseAt(new Date(Date.now() + 1000));
}
async function chargeCurrent(page: Page) {
  await page.clock.runFor(1000); // Finish presentation before using a paused-clock control.
  const before = await saved(page); await chooseCommand(page, "special", "charge"); await page.getByRole("button", { name: "実行", exact: true }).click(); await expect.poll(async () => (await saved(page)).battle?.sequence ?? 0).toBeGreaterThan(before.battle!.sequence);
}
for (const kind of ["pair-defense", "protection"] as const) test(`production M01 ${kind} selects real supporters, shows defense VFX and resumes independent durations`, async ({ page, context }, testInfo) => {
  await context.setOffline(true); await page.clock.install(); let progress = offlineAddonFixtureProgress();
  for (const partId of ["opening-capacitor", "emergency-capacitor", "formation-extension-unlock"]) progress = applyRobotCustomization(progress, { kind: "addon-equip", coreId: "core-a", partId });
  await importEarned(page, progress); await controlled(page);
  const before = await saved(page), model = robotFormalBattleAdapter.project(before.battle!), choice = model.choices.find(c => c.commandId.startsWith(kind + ":"))!; expect(choice).toBeDefined();
  await chooseCommand(page, "formation", choice.commandId);
  for (const id of choice.selection.participantIds) await selectMapCell(page, model.units.find(u => u.id === id)!.cell, testInfo.project.name !== "desktop");
  await page.getByRole("button", { name: "実行", exact: true }).click(); await expect.poll(async () => (await saved(page)).battle!.sequence).toBe(before.battle!.sequence + 1); await page.clock.runFor(780);
  const checkpoint = await saved(page), core = decodeRobotBattleCore(checkpoint.battle!.snapshot), initiatorId = decodeRobotBattleCore(before.battle!.snapshot).turn.actorId!, expectedIds = kind === "pair-defense" ? [initiatorId] : [initiatorId, ...choice.selection.participantIds];
  expect(core.spentFormations).toContain(kind); for (const id of expectedIds) expect(getRobotBattleUnit(core, id).formationDefense![0]!).toMatchObject({ kind, ownerId: initiatorId });
  await expect(page.locator('[data-vfx="defense_up"]')).toHaveCount(expectedIds.length);
  mkdirSync("test-results/robot-vfx-review", { recursive: true }); await page.screenshot({ path: `test-results/robot-vfx-review/${testInfo.project.name}-M01-${kind}.png` });
  await page.reload(); expect(await saved(page)).toEqual(checkpoint); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test("production M01 burn uses real blast targeting and target-own-turn DOT after durable resume", async ({ page, context }, testInfo) => {
  await context.setOffline(true); await page.clock.install(); let progress = offlineAddonFixtureProgress();
  for (const partId of ["opening-capacitor", "burning-round"]) progress = applyRobotCustomization(progress, { kind: "addon-equip", coreId: "core-c", partId });
  progress = applyRobotCustomization(progress, { kind: "part-equip", coreId: "core-c", slot: "weapon2", partId: "howitzer" });
  await importEarned(page, progress);
  for (let n = 0; n < 6; n++) { await controlled(page); const save = await saved(page), core = decodeRobotBattleCore(save.battle!.snapshot); if (core.turn.actorId === "core-c") break; await chargeCurrent(page); }
  const before = await saved(page), model = robotFormalBattleAdapter.project(before.battle!), options = getRobotActiveCombatOptions(decodeRobotBattleCore(before.battle!.snapshot), "burning-round", "howitzer"); expect(options.disabledReason).toBeNull();
  const choice = model.choices.find(c => c.commandId === "burning-round:howitzer" && c.selection.targetIds.length === 1 && c.selection.targetIds[0] === "assault-1:3")!; expect(choice).toBeDefined();
  await chooseCommand(page, "special", choice.commandId); await page.getByRole("button", { name: "俯瞰", exact: true }).click();
  const center = page.getByRole("grid").locator('g[data-unit-id="assault-1:3"]');
  // Existing blast flow selects the center on the first overview tap; a second toggles it off.
  if (testInfo.project.name === "desktop") await center.click(); else await center.tap();
  await expect(page.getByRole("button", { name: "決定", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "決定", exact: true }).click(); await expect.poll(async () => (await saved(page)).battle!.sequence).toBe(before.battle!.sequence + 1); await page.clock.runFor(200);
  const checkpoint = await saved(page), burned = getRobotBattleUnit(decodeRobotBattleCore(checkpoint.battle!.snapshot), "assault-1:3"); expect(burned.burning).toMatchObject({ sourceId: "core-c", sourceCoreLevel: 41, ticksRemaining: 3 }); expect(burned.hp).toBeGreaterThan(0); await expect(page.locator('[data-vfx="dot"][data-vfx-loop="true"]')).toHaveCount(1);
  mkdirSync("test-results/robot-vfx-review", { recursive: true }); await page.screenshot({ path: `test-results/robot-vfx-review/${testInfo.project.name}-M01-burning.png` });
  await page.reload(); expect(await saved(page)).toEqual(checkpoint);
  await page.evaluate(() => { (window as Window & { adoptedEffects?: string[] }).adoptedEffects = []; document.addEventListener("robot-battle-vfx", e => (window as Window & { adoptedEffects?: string[] }).adoptedEffects!.push((e as CustomEvent).detail.effect)); });
  for (let n = 0; n < 15; n++) { await controlled(page); if (await page.evaluate(() => (window as Window & { adoptedEffects?: string[] }).adoptedEffects?.includes("dot"))) break; await chargeCurrent(page); }
  expect(await page.evaluate(() => (window as Window & { adoptedEffects?: string[] }).adoptedEffects?.includes("dot"))).toBe(true);
});
test("production M01 overwatch reacts to real enemy AI movement after resume without a second EN payment", async ({ page, context }) => {
  await context.setOffline(true); await page.clock.install(); let progress = offlineAddonFixtureProgress();
  progress = applyRobotCustomization(progress, { kind: "addon-equip", coreId: "core-c", partId: "opening-capacitor" });
  progress = applyRobotCustomization(progress, { kind: "part-equip", coreId: "core-c", slot: "weapon2", partId: "howitzer" }); await importEarned(page, progress);
  for (let n = 0; n < 6; n++) { await controlled(page); if (decodeRobotBattleCore((await saved(page)).battle!.snapshot).turn.actorId === "core-c") break; await chargeCurrent(page); }
  const before = await saved(page); await chooseCommand(page, "special", "overwatch:howitzer"); await page.getByRole("button", { name: "実行", exact: true }).click(); await expect.poll(async () => (await saved(page)).battle!.sequence).toBe(before.battle!.sequence + 1);
  const checkpoint = await saved(page), source = getRobotBattleUnit(decodeRobotBattleCore(checkpoint.battle!.snapshot), "core-c"); expect(source.overwatch).toEqual({ weaponId: "howitzer", hitUnitIds: [], multiplier: .7 }); expect(source.energy.action!.energyCost).toBe(25); await page.reload(); expect(await saved(page)).toEqual(checkpoint);
  await page.evaluate(() => { (window as Window & { adoptedEffects?: string[] }).adoptedEffects = []; document.addEventListener("robot-battle-vfx", e => (window as Window & { adoptedEffects?: string[] }).adoptedEffects!.push((e as CustomEvent).detail.effect)); });
  for (let n = 0; n < 15; n++) { await controlled(page); if (await page.evaluate(() => (window as Window & { adoptedEffects?: string[] }).adoptedEffects?.includes("blast"))) break; await chargeCurrent(page); }
  expect(await page.evaluate(() => (window as Window & { adoptedEffects?: string[] }).adoptedEffects?.includes("blast"))).toBe(true);
});

test("portrait only shows a rotation notice and changing orientation preserves the save", async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "Rotation guidance is a phone-only presentation check");
  await context.setOffline(true); await page.goto(url); await expect(page.getByRole("button", { name: "ミッション選択", exact: true })).toBeVisible();
  const before = await saved(page), notice = page.getByRole("status", { name: "横向きへの回転案内", exact: true });
  await expect(notice).toBeHidden(); await page.setViewportSize({ width: 390, height: 844 });
  await expect(notice).toBeVisible(); await expect(notice).toContainText("横向き"); expect(await saved(page)).toEqual(before);
  await page.setViewportSize({ width: 844, height: 390 }); await expect(notice).toBeHidden(); expect(await saved(page)).toEqual(before);
});

test("production command menu shows only equipped types and keeps temporarily blocked commands with reasons", async ({ page, context }, info) => {
  await context.setOffline(true); await page.clock.install(); await page.goto(url); await depart(page); await controlled(page);
  const before = await saved(page), model = robotFormalBattleAdapter.project(before.battle!);
  await chooseCommand(page, "attack", "charge-strike:light-blade");
  await expect(page.getByLabel("行動の種類", { exact: true }).locator('option[value="charge-strike:light-blade"]')).toHaveText("特攻（EN0）");
  await expect(page.getByText("通常移動後に使用できます", { exact: true })).toBeVisible(); await expect(page.getByRole("button", { name: "実行", exact: true })).toBeDisabled();
  await chooseCommand(page, "special", "combo");
  const menu = page.getByLabel("行動の種類", { exact: true }); await expect(menu.locator('option[value="combo"]')).toHaveText("武装コンボ：双対象攻撃（EN55）");
  for (const prefix of ["super-charge:", "hp-heal:", "burning-round:", "charge-strike:"]) await expect(menu.locator(`option[value^="${prefix}"]`)).toHaveCount(0);
  const combo = model.commands.find(c => c.id === "combo")!;
  if (combo.disabledReason) { await expect(page.getByText(combo.disabledReason, { exact: true })).toBeVisible(); await expect(page.getByRole("button", { name: "実行", exact: true })).toBeDisabled(); }
  await chooseCommand(page, "formation", "delta:light-blade");
  await expect(menu.locator('option[value^="pincer:"]')).toHaveCount(0); await expect(menu.locator('option[value^="protection:"]')).toHaveCount(0);
  const delta = model.commands.find(c => c.id === "delta:light-blade")!; expect(delta.disabledReason).not.toBeNull();
  await expect(page.getByText(delta.disabledReason!, { exact: true })).toBeVisible(); await expect(page.getByRole("button", { name: "実行", exact: true })).toBeDisabled();
  expect(await saved(page)).toEqual(before); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `test-results/robot-feedback-${info.project.name}-commands.png` });
});

test("real M01 action-only history highlights the committed actor and keeps the saved battle unchanged", async ({ page, context }) => {
  await context.setOffline(true); await page.clock.install(); await page.goto(url); await depart(page); await controlled(page);
  const before = await saved(page), battle = before.battle!;
  const state = decodeRobotBattleCore(battle.snapshot), actor = getRobotBattleActor(state), member = getRobotBattleUnit(state, actor.unitIds[0]!);
  const history = page.getByRole("region", { name: "直近3行動" });
  const command = robotFormalBattleAdapter.project(battle).commands.find(c => c.id === "defend");
  expect(command).toBeDefined();
  await page.getByRole("navigation", { name: "戦闘操作" }).getByRole("button", { name: "特殊", exact: true }).click();
  await page.getByLabel("行動の種類", { exact: true }).selectOption("defend");
  await page.getByRole("button", { name: "実行", exact: true }).click();
  await expect.poll(async () => (await saved(page)).battle?.sequence).toBe(battle.sequence + 1);
  const entry = history.locator(".battle-history-item").first();
  await expect(entry).toContainText(member.name);
  await expect(entry).toContainText("防御");
  await expect(entry.locator(".battle-log-controlled")).toContainText(member.name);
  await expect(entry).toHaveClass(/battle-history-current/);
  expect(await entry.locator(".battle-log-controlled").evaluate(el => getComputedStyle(el).color)).toBe("rgb(145, 202, 255)");
  await expect(page.getByRole("grid").locator(".battle-log-actor-ring")).toHaveCount(1);
  await page.getByRole("button", { name: "俯瞰", exact: true }).click();
  await expect(history.locator(".battle-history-item").first()).toContainText("防御");
  expect((await saved(page)).battle!.snapshot).not.toEqual(battle.snapshot);
  await page.reload(); await expect(page.getByRole("grid")).toBeVisible();
  await expect(page.getByRole("region", { name: "直近3行動" }).locator(".battle-history-item").first()).toContainText("防御");
});


test("real M01 playback stages the resolved action and changes only visual speed", async ({ page, context }) => {
  await context.setOffline(true); await page.clock.install(); await page.goto(url); await depart(page); await controlled(page);
  const before = await saved(page), battle = before.battle!;
  await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now() + 1000)));
  const history = page.getByRole("region", { name: "直近3行動" });
  const previousId = await history.locator(".battle-history-item").first().getAttribute("data-action-id");
  const speed = page.getByRole("button", { name: "演出速度：標準" });
  await expect(speed).toBeVisible();
  await page.getByRole("navigation", { name: "戦闘操作" }).getByRole("button", { name: "特殊", exact: true }).click();
  await page.getByLabel("行動の種類", { exact: true }).selectOption("defend");
  await page.getByRole("button", { name: "実行", exact: true }).click();
  await expect.poll(async () => (await saved(page)).battle?.sequence).toBe(battle.sequence + 1);
  await expect(history.locator(".battle-history-item").first()).toHaveAttribute("data-action-id", previousId!);
  await expect(page.getByRole("grid").locator(".battle-log-actor-ring")).toHaveCount(1);
  await page.clock.runFor(199);
  await expect(history.locator(".battle-history-item").first()).toHaveAttribute("data-action-id", previousId!);
  await page.clock.runFor(1);
  await expect(history.locator(".battle-history-item").first()).not.toHaveAttribute("data-action-id", previousId!);
  await expect(history.locator(".battle-history-item").first()).toContainText("防御");
  const checkpoint = await saved(page);
  await page.getByRole("button", { name: "演出速度：標準" }).click();
  await expect(page.getByRole("button", { name: "演出速度：高速" })).toBeVisible();
  await page.getByRole("button", { name: "演出速度：高速" }).click();
  await expect(page.getByRole("button", { name: "演出速度：スキップ" })).toBeVisible();
  await page.getByRole("button", { name: "演出速度：スキップ" }).click();
  await expect(page.getByRole("button", { name: "演出速度：標準" })).toBeVisible();
  expect(await saved(page)).toEqual(checkpoint);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight)).toBe(true);
});

test("real M01 ordinary movement visibly carries robot art and weapon along the route without changing saved cells", async ({ page, context }, testInfo) => {
  await context.setOffline(true); await page.clock.install(); await page.goto(url); await depart(page); await controlled(page);
  await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now() + 1000)));
  const before = await saved(page), core = decodeRobotBattleCore(before.battle!.snapshot), sourceId = core.turn.actorId!;
  const model = robotFormalBattleAdapter.project(before.battle!);
  const moves = model.choices.filter(choice => choice.commandId === "move" && choice.selection.destination);
  expect(moves.length).toBeGreaterThan(0);
  // Choose the longest reachable route so the sprite crosses intermediate cells.
  const origin = getRobotBattleUnit(core, sourceId).position!;
  const chosen = [...moves].sort((a, b) => {
    const distance = (cell: {x:number;y:number}) => Math.max(Math.abs(cell.x-origin.x),Math.abs(cell.y-origin.y));
    return distance(b.selection.destination!) - distance(a.selection.destination!);
  })[0]!;
  await chooseCommand(page, "move", "move");
  await selectMapCell(page, chosen.selection.destination!, testInfo.project.name !== "desktop");
  const savedBeforeClick = await saved(page);
  expect(savedBeforeClick).toEqual(before);
  await page.getByRole("button", { name: "実行", exact: true }).click();
  await expect.poll(async () => (await saved(page)).battle?.sequence).toBe(before.battle!.sequence + 1);
  const after = await saved(page);
  expect(getRobotBattleUnit(decodeRobotBattleCore(after.battle!.snapshot), sourceId).position).toEqual(chosen.selection.destination);
  const sprite = page.getByRole("grid").locator(`[data-unit-visual="${sourceId}"]`);
  const start = await sprite.getAttribute("transform");
  expect(start).toMatch(/^translate\(/);
  await expect(page.getByRole("grid").locator(".robot-movement-route").first()).toBeVisible();
  const gear = sprite.locator("image");
  await expect(gear.first()).toBeAttached();
  await page.clock.runFor(200);
  const mid = await sprite.getAttribute("transform");
  expect(mid).not.toBe(start);
  expect(mid).toMatch(/^translate\(/);
  expect(await saved(page)).toEqual(after);
  await page.clock.runFor(1500);
  await expect(page.getByRole("grid").locator(`[data-unit-visual="${sourceId}"]`)).not.toHaveAttribute("transform", /translate/);
  await expect(page.getByRole("grid").locator(".robot-movement-route")).toHaveCount(0);
  expect(await saved(page)).toEqual(after);
  await page.reload();
  await expect(page.getByRole("grid").locator(".robot-movement-route")).toHaveCount(0);
  expect(await saved(page)).toEqual(after);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight)).toBe(true);
});

test("normal movement animation aborts on reload but retains the authoritative arrival cell", async ({ page, context }, info) => {
  await context.setOffline(true); await page.clock.install(); await page.goto(url); await depart(page); await controlled(page);
  await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now() + 1000)));
  const before = await saved(page), model = robotFormalBattleAdapter.project(before.battle!), move = model.choices.find(choice => choice.commandId === "move" && choice.selection.destination);
  expect(move).toBeDefined();
  await chooseCommand(page, "move", "move");
  await selectMapCell(page, move!.selection.destination!, info.project.name !== "desktop");
  await page.getByRole("button", { name: "実行", exact: true }).click();
  await expect.poll(async () => (await saved(page)).battle?.sequence).toBe(before.battle!.sequence + 1);
  await expect(page.getByRole("grid").locator(".robot-movement-route").first()).toBeVisible();
  const committed = await saved(page);
  await page.reload();
  await expect(page.getByRole("grid").locator(".robot-movement-route")).toHaveCount(0);
  expect(await saved(page)).toEqual(committed);
});
