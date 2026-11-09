import { expect, test, type Page } from "@playwright/test";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import type { RobotOfflineSave } from "../../src/games/robot-tactics/offlineSession";
import type { RobotBattleCoreState } from "../../src/games/robot-tactics/battleState";

const app=pathToFileURL(resolve("dist/robot-tactics-offline/index.html")).href;
async function saved(page:Page):Promise<RobotOfflineSave>{
  const raw=await page.evaluate(()=>new Promise<string>((resolve,reject)=>{
    const r=indexedDB.open("robot-tactics-offline",1);r.onerror=()=>reject(r.error);
    r.onsuccess=()=>{const db=r.result,tx=db.transaction("checkpoints"),read=tx.objectStore("checkpoints").get("save");read.onerror=()=>reject(read.error);read.onsuccess=()=>{db.close();resolve(read.result as string);};};
  }));
  return JSON.parse(raw) as RobotOfflineSave;
}
async function replace(page:Page,next:RobotOfflineSave){
  await page.evaluate(raw=>new Promise<void>((resolve,reject)=>{
    const r=indexedDB.open("robot-tactics-offline",1);r.onerror=()=>reject(r.error);
    r.onsuccess=()=>{const db=r.result,tx=db.transaction("checkpoints","readwrite");tx.objectStore("checkpoints").put(raw,"save");tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};
  }),JSON.stringify(next));
}
const pos=(c:{x:number;y:number},d:{x:number;y:number})=>Math.max(Math.abs(c.x-d.x),Math.abs(c.y-d.y));
test("M04 depot can be selected and damaged by charge in real offline PC/mobile landscape",async({page,context})=>{
  await context.setOffline(true);
  await page.goto(app);
  const initial=await saved(page);
  await replace(page,{...initial,revision:initial.revision+1,progress:{...initial.progress,cleared:["easy-01","easy-02","easy-03"]}});
  await page.reload();
  await page.getByRole("button",{name:"ミッション選択",exact:true}).click();
  await page.getByRole("button",{name:/^M04 /}).click();
  await page.getByRole("button",{name:"Easy",exact:true}).click();
  await expect(page.getByRole("grid",{name:"戦場マップ"})).toBeVisible();
  // The real initiative is preserved: use legal waits to reach the controlled
  // core instead of inventing an out-of-order battle snapshot.
  for(let i=0;i<25;i++){
    const b=(await saved(page)).battle;
    if(!b)throw new Error("M04 ended before the first controlled turn");
    const core=b.snapshot as unknown as RobotBattleCoreState;
    if(core.turn.actorId==="core-a")break;
    if(core.turn.actorId?.startsWith("core-")){
      await page.getByRole("navigation",{name:"戦闘操作"}).getByRole("button",{name:"待機",exact:true}).click();
      await page.getByRole("button",{name:"実行",exact:true}).click();
    }else await page.waitForTimeout(350);
  }
  const before=await saved(page),core=before.battle!.snapshot as unknown as RobotBattleCoreState;
  expect(core.turn.actorId).toBe("core-a");
  const depot=core.objective.kind==="early"?core.objective.state.objects.objects.find(f=>f.id==="depot-left"):null;
  if(!depot)throw new Error("M04 depot not found");
  const occupied=core.units.filter(u=>u.id!=="core-a"&&u.hp>0&&u.position).map(u=>u.position!);
  const blocked=[...core.board.walls,...occupied,...(core.objective.kind==="early"?core.objective.state.objects.objects.flatMap(f=>f.cells):[])];
  let candidate:{x:number;y:number}|null=null;
  for(let y=0;y<core.board.height&&!candidate;y++)for(let x=0;x<core.board.width&&!candidate;x++){
    const start={x,y};
    if(!depot.cells.some(c=>pos(c,start)===2)||blocked.some(c=>pos(c,start)===0))continue;
    for(const c of depot.cells.filter(c=>pos(c,start)===2)){
      const landing={x:x+Math.sign(c.x-x),y:y+Math.sign(c.y-y)};
      if(!blocked.some(b=>pos(b,landing)===0)&&pos(c,landing)===1)candidate=start;
    }
  }
  if(!candidate)throw new Error("No free charge starting tile in M04");
  const changed={...before,battle:{...before.battle!,snapshot:{...core,units:core.units.map(u=>u.id==="core-a"?{...u,position:candidate,energy:{...u.energy,moved:true}}:u)} as unknown as NonNullable<RobotOfflineSave["battle"]>["snapshot"]}};
  await replace(page,changed);
  await page.reload();
  await expect(page.getByRole("grid",{name:"戦場マップ"})).toBeVisible();
  const nav=page.getByRole("navigation",{name:"戦闘操作"});
  await nav.getByRole("button",{name:"攻撃",exact:true}).click();
  await page.getByLabel("行動の種類").selectOption("charge-strike:light-blade");
  const target=page.getByRole("grid",{name:"戦場マップ"}).locator('g[data-cell="D3"]');
  await page.getByRole("button",{name:"俯瞰",exact:true}).click();
  await target.click();await target.click();
  await expect(page.getByRole("button",{name:"実行",exact:true})).toBeVisible();
  await page.getByRole("button",{name:"実行",exact:true}).click();
  await expect.poll(async()=>(await saved(page)).battle?.sequence).toBe(before.battle!.sequence+1);
  const after=await saved(page),newCore=after.battle!.snapshot as unknown as RobotBattleCoreState;
  const nextDepot=newCore.objective.kind==="early"?newCore.objective.state.objects.objects.find(f=>f.id==="depot-left"):null;
  expect(nextDepot!.hp).toBeLessThan(depot.hp);
  expect(newCore.latest!.damage.some(e=>e.targetId==="depot-left")).toBe(true);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.reload();await expect(page.getByRole("grid",{name:"戦場マップ"})).toBeVisible();
  expect((await saved(page)).battle!.snapshot).toEqual(after.battle!.snapshot);
});
