import { expect, test, type Page, type BrowserContext } from "@playwright/test";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { mkdirSync } from "node:fs";
import { pathToFileURL } from "node:url";
import type { RobotOfflineSave } from "../../src/games/robot-tactics/offlineSession";
const h = createRequire(import.meta.url)(resolve("test-results/robot-formal-harness/controller.cjs")) as typeof import("./formalHarness");
const weapon = "heavy-missile-cannon";
async function saved(page: Page): Promise<RobotOfflineSave> {
  return page.evaluate(() => new Promise((resolve, reject) => { const r = indexedDB.open("robot-tactics-offline", 1); r.onerror = () => reject(r.error); r.onsuccess = () => { const db = r.result, tx = db.transaction("checkpoints"), read = tx.objectStore("checkpoints").get("save"); read.onsuccess = () => { db.close(); resolve(JSON.parse(read.result as string)); }; read.onerror = () => reject(read.error); }; }));
}
async function actualM01(page: Page, context: BrowserContext) {
  await context.setOffline(true); await page.clock.install();
  let progress = h.offlineAddonFixtureProgress();
  for (const partId of ["delayed-fuse"]) progress = h.applyRobotCustomization(progress, { kind: "addon-equip", coreId: "core-c", partId });
  progress = h.applyRobotCustomization(progress, { kind: "part-equip", coreId: "core-c", slot: "weapon2", partId: weapon });
  await page.goto(pathToFileURL(resolve("dist/robot-tactics-offline/index.html")).href);
  await page.getByRole("button", { name: "設定", exact: true }).click(); page.once("dialog", d => d.accept());
  await page.getByLabel("バックアップを読み込む", { exact: true }).setInputFiles({ name: "explicit-earned-addon-progression.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ ...h.createRobotOfflineSave(), progress })) });
  await expect.poll(async () => (await saved(page)).progress.party[2]!.addons.length).toBe(1);
  await page.getByRole("button", { name: "ホーム", exact: true }).click(); await page.getByRole("button", { name: "ミッション選択", exact: true }).click(); await page.getByRole("button", { name: /^M01 / }).click(); await page.getByRole("button", { name: "Easy", exact: true }).click(); await expect(page.getByRole("grid")).toBeVisible();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  for (let n = 0; n < 20; n++) {
    await page.clock.runFor(1000); const save = await saved(page), s = h.decodeRobotBattleCore(save.battle!.snapshot), actor = h.getRobotBattleUnit(s, h.getRobotBattleActor(s).unitIds[0]!);
    if (actor.kind === "controlled") {
      if (actor.id === "core-c") return;
      await page.getByRole("navigation", { name: "戦闘操作" }).getByRole("button", { name: "特殊", exact: true }).click(); await page.getByLabel("行動の種類", { exact: true }).selectOption("charge"); await page.getByRole("button", { name: "実行", exact: true }).click();
      await expect.poll(async () => (await saved(page)).battle!.sequence).toBeGreaterThan(save.battle!.sequence);
    }
  }
  throw new Error("Real M01 did not reach the equipped actor");
}

async function selectFuse(page: Page, targetId: string) {
  await page.getByRole("navigation", { name: "戦闘操作" }).getByRole("button", { name: "特殊", exact: true }).click();
  await page.getByLabel("行動の種類", { exact: true }).selectOption("delayed-fuse:" + weapon);
  await page.getByRole("button", { name: "俯瞰", exact: true }).click();
  const s = h.decodeRobotBattleCore((await saved(page)).battle!.snapshot), cell = h.getRobotBattleUnit(s, targetId).position!, name = String.fromCharCode(65 + cell.x) + (cell.y + 1);
  const target = page.getByRole("grid").locator(`g[data-cell="${name}"]`);
  await target.click(); if (await page.getByRole("button", {name:"実行",exact:true}).isDisabled()) await target.click();
}
async function advance(page: Page) {
  const before = await saved(page), s = h.decodeRobotBattleCore(before.battle!.snapshot), actor = h.getRobotBattleUnit(s, h.getRobotBattleActor(s).unitIds[0]!);
  if (actor.kind === "controlled") {
    await page.getByRole("navigation", { name: "戦闘操作" }).getByRole("button", {name:"特殊",exact:true}).click();
    await page.getByLabel("行動の種類",{exact:true}).selectOption("charge"); await page.getByRole("button",{name:"実行",exact:true}).click();
  } else await page.clock.runFor(1000);
  await expect.poll(async()=> (await saved(page)).battle!.sequence).toBeGreaterThan(before.battle!.sequence);
}

test("production M01: attach EN10 with no damage, badge/timing, durable retry/replay/resume and mission retry", async ({page,context},info)=> {
  await actualM01(page,context); const before=await saved(page), s=h.decodeRobotBattleCore(before.battle!.snapshot), targetId=h.getRobotDelayedFuseOptions(s,weapon).targetIds.at(-1)!;
  expect(targetId).toBeDefined(); await selectFuse(page,targetId); expect(await saved(page)).toEqual(before);
  await page.evaluate(()=>{ const put=IDBObjectStore.prototype.put; IDBObjectStore.prototype.put=function(this:IDBObjectStore,value:unknown,key?:IDBValidKey){IDBObjectStore.prototype.put=put;if(this.name==="checkpoints")throw new DOMException("disk-full","QuotaExceededError");return put.call(this,value,key!);}; });
  await page.getByRole("button",{name:"実行",exact:true}).click(); await expect(page.getByRole("alert").last()).toBeVisible(); expect(await saved(page)).toEqual(before);
  await page.getByRole("button",{name:"実行",exact:true}).evaluate((b:HTMLButtonElement)=>{b.click();b.click();});
  await expect.poll(async()=>(await saved(page)).battle!.sequence).toBe(before.battle!.sequence+1);
  const checkpoint=await saved(page), after=h.decodeRobotBattleCore(checkpoint.battle!.snapshot);
  expect(after.units.map(u=>u.hp)).toEqual(s.units.map(u=>u.hp)); expect(after.latest!.damage).toEqual([]); expect(h.getRobotBattleUnit(after,"core-c").energy.action!.energyCost).toBe(10);
  await expect(page.locator('[data-bomb-count="1"]')).toHaveCount(1); await expect(page.locator('.robot-battle-fx')).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight)).toBe(true);
  mkdirSync("test-results/robot-vfx-review",{recursive:true}); await page.screenshot({path:`test-results/robot-vfx-review/${info.project.name}-M01-fuse-attached.png`});
  await page.reload(); expect(await saved(page)).toEqual(checkpoint); await expect(page.locator('[data-bomb-count="1"]')).toHaveCount(1); await expect(page.locator('.robot-battle-fx')).toHaveCount(0);
  await page.getByRole("button",{name:"オプション",exact:true}).click(); page.once("dialog",d=>d.accept()); await page.getByRole("button",{name:"再挑戦",exact:true}).click();
  await expect.poll(async()=>(await saved(page)).battle!.sequence).toBe(0); expect(h.decodeRobotBattleCore((await saved(page)).battle!.snapshot).fuses).toBeUndefined(); await expect(page.locator('[data-bomb-count]')).toHaveCount(0);
});
test("production M01: real NPC moves its attached bomb, detonates at own-turn end with VFX, and reload never repeats damage", async({page,context},info)=>{
  await actualM01(page,context); const before=h.decodeRobotBattleCore((await saved(page)).battle!.snapshot), targetId=h.getRobotDelayedFuseOptions(before,weapon).targetIds.at(-1)!;
  await selectFuse(page,targetId); await page.getByRole("button",{name:"実行",exact:true}).click();
  await expect.poll(async()=>h.decodeRobotBattleCore((await saved(page)).battle!.snapshot).fuses?.bombs.length).toBe(1);
  let exploded=false;
  for(let n=0;n<40;n++){
    const savedBefore=await saved(page), state=h.decodeRobotBattleCore(savedBefore.battle!.snapshot), actor=h.getRobotBattleActor(state);
    if(actor.unitIds.includes(targetId)){
      const planned=h.planRobotNpcTurn(state), final=h.getRobotBattleUnit(planned.stateAfterMoves,targetId).position!;
      expect(final).not.toEqual(h.getRobotBattleUnit(before,targetId).position);
      // Overview keeps the actual post-movement explosion in the visible camera.
      await page.getByRole("button",{name:"俯瞰",exact:true}).click();
      await advance(page); const checkpoint=await saved(page), after=h.decodeRobotBattleCore(checkpoint.battle!.snapshot);
      expect(after.latest!.fuseExplosions![0]!.cell).toEqual(final); expect(after.fuses!.bombs[0]!.state).toBe("detonated");
      expect(after.latest!.damage.some(d=>d.effectKind==="special:delayed-fuse")).toBe(true);
      for(let frame=0;frame<30 && await page.locator('[data-vfx="blast"]').count()===0;frame++) await page.clock.runFor(40);
      await expect(page.locator('[data-vfx="blast"]')).not.toHaveCount(0);
      await expect(page.locator('[data-bomb-count]')).toHaveCount(0);
      const camera=JSON.parse((await page.getByRole("grid").getAttribute("data-camera"))!);
      expect(final.x>=camera.x&&final.y>=camera.y&&final.x<camera.x+camera.width&&final.y<camera.y+camera.height).toBe(true);
      mkdirSync("test-results/robot-vfx-review",{recursive:true}); await page.screenshot({path:`test-results/robot-vfx-review/${info.project.name}-M01-fuse-explosion.png`});
      await page.reload(); expect(await saved(page)).toEqual(checkpoint); await expect(page.locator('.robot-battle-fx')).toHaveCount(0); exploded=true;break;
    }
    await advance(page);
  }
  expect(exploded).toBe(true);
});
