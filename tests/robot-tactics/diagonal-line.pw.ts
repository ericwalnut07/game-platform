import { expect, test, type Page } from "@playwright/test";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import type { RobotOfflineSave } from "../../src/games/robot-tactics/offlineSession";
import type { RobotBattleCoreState } from "../../src/games/robot-tactics/battleState";

const app=pathToFileURL(resolve("dist/robot-tactics-offline/index.html")).href;
async function saved(page:Page):Promise<RobotOfflineSave>{
  const raw=await page.evaluate(()=>new Promise<string>((resolve,reject)=>{
    const r=indexedDB.open("robot-tactics-offline",1);r.onerror=()=>reject(r.error);
    r.onsuccess=()=>{const db=r.result,read=db.transaction("checkpoints").objectStore("checkpoints").get("save");read.onerror=()=>reject(read.error);read.onsuccess=()=>{db.close();resolve(read.result as string);};};
  }));
  return JSON.parse(raw) as RobotOfflineSave;
}
async function replace(page:Page,next:RobotOfflineSave){
  await page.evaluate(raw=>new Promise<void>((resolve,reject)=>{
    const r=indexedDB.open("robot-tactics-offline",1);r.onerror=()=>reject(r.error);
    r.onsuccess=()=>{const db=r.result,tx=db.transaction("checkpoints","readwrite");tx.objectStore("checkpoints").put(raw,"save");tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};
  }),JSON.stringify(next));
}
test("diagonal line formation selects participant and target on the real PC/mobile map and persists damage",async({page,context})=>{
  await context.setOffline(true);await page.goto(app);
  await expect.poll(async()=>page.evaluate(()=>new Promise<boolean>((resolve,reject)=>{
    const r=indexedDB.open("robot-tactics-offline",1);r.onerror=()=>reject(r.error);
    r.onsuccess=()=>{const db=r.result,read=db.transaction("checkpoints").objectStore("checkpoints").get("save");read.onerror=()=>reject(read.error);read.onsuccess=()=>{db.close();resolve(typeof read.result==="string");};};
  }))).toBe(true);
  await page.getByRole("button",{name:"ミッション選択",exact:true}).click();
  await page.getByRole("button",{name:/^M01 /}).click();
  await page.getByRole("button",{name:"Easy",exact:true}).click();
  await expect(page.getByRole("grid",{name:"戦場マップ"})).toBeVisible();
  for(let i=0;i<25;i++){
    const b=(await saved(page)).battle;if(!b)throw new Error("M01 ended");
    const core=b.snapshot as unknown as RobotBattleCoreState;
    if(core.turn.actorId==="core-a")break;
    if(core.turn.actorId?.startsWith("core-")){
      await page.getByRole("navigation",{name:"戦闘操作"}).getByRole("button",{name:"待機",exact:true}).click();
      await page.getByRole("button",{name:"実行",exact:true}).click();
    }else await page.waitForTimeout(350);
  }
  const before=await saved(page),core=before.battle!.snapshot as unknown as RobotBattleCoreState;
  expect(core.turn.actorId).toBe("core-a");
  const enemy=core.units.find(u=>u.kind==="light"&&u.hp>0)!;
  const source={x:6,y:6},ally={x:5,y:5},target={x:7,y:7};
  const moved={...core,units:core.units.map(u=>u.id==="core-a"?{...u,position:source,energy:{...u.energy,en:u.energy.maxEn}}:u.id==="core-b"?{...u,position:ally}:u.id===enemy.id?{...u,position:target}:u)};
  await replace(page,{...before,battle:{...before.battle!,snapshot:moved as unknown as NonNullable<RobotOfflineSave["battle"]>["snapshot"]}});
  await page.reload();await expect(page.getByRole("grid",{name:"戦場マップ"})).toBeVisible();
  await page.getByRole("button",{name:"俯瞰",exact:true}).click();
  await page.getByRole("navigation",{name:"戦闘操作"}).getByRole("button",{name:"連携",exact:true}).click();
  await page.getByLabel("行動の種類").selectOption("line:light-blade");
  const map=page.getByRole("grid",{name:"戦場マップ"});
  await map.locator('g[data-cell="F6"]').click();await map.locator('g[data-cell="F6"]').click();
  await map.locator('g[data-cell="H8"]').click();
  await expect(page.getByRole("button",{name:"実行",exact:true})).toBeEnabled();
  await page.getByRole("button",{name:"実行",exact:true}).click();
  await expect.poll(async()=>(await saved(page)).battle?.sequence).toBe(before.battle!.sequence+1);
  const after=await saved(page),result=after.battle!.snapshot as unknown as RobotBattleCoreState;
  expect(result.spentFormations).toContain("line");
  expect(result.latest!.damage.some(d=>d.targetId===enemy.id&&d.damage!==null&&d.damage>0)).toBe(true);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.reload();await expect(page.getByRole("grid",{name:"戦場マップ"})).toBeVisible();
  expect((await saved(page)).battle!.snapshot).toEqual(after.battle!.snapshot);
});
