import { expect, test, type Page } from "@playwright/test";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import type { RobotOfflineSave } from "../../src/games/robot-tactics/offlineSession";
import type { RobotBattleCoreState } from "../../src/games/robot-tactics/battleState";
import { getRobotFormationOptions } from "../../src/games/robot-tactics/formations";

const app = pathToFileURL(resolve("dist/robot-tactics-offline/index.html")).href;
type Cell = {x:number;y:number};
const name = (p:Cell) => String.fromCharCode(65+p.x)+(p.y+1);
const same = (a:Cell,b:Cell) => a.x===b.x&&a.y===b.y;
async function saved(page:Page):Promise<RobotOfflineSave> {
  const value = await page.evaluate(()=>new Promise<string>((resolve,reject)=>{
    const r=indexedDB.open("robot-tactics-offline",1);r.onerror=()=>reject(r.error);
    r.onsuccess=()=>{const db=r.result,read=db.transaction("checkpoints").objectStore("checkpoints").get("save");
      read.onerror=()=>reject(read.error);read.onsuccess=()=>{db.close();resolve(read.result as string);};};
  }));
  return JSON.parse(value) as RobotOfflineSave;
}
async function replace(page:Page,value:RobotOfflineSave):Promise<void>{
  await page.evaluate(raw=>new Promise<void>((resolve,reject)=>{
    const r=indexedDB.open("robot-tactics-offline",1);r.onerror=()=>reject(r.error);
    r.onsuccess=()=>{const db=r.result,tx=db.transaction("checkpoints","readwrite");
      tx.objectStore("checkpoints").put(raw,"save");tx.onerror=()=>reject(tx.error);tx.oncomplete=()=>{db.close();resolve();};};
  }),JSON.stringify(value));
}
async function tap(page:Page,p:Cell):Promise<void>{
  const overview=page.getByRole("button",{name:"俯瞰",exact:true});
  if(await overview.count())await overview.click();
  const cell=page.getByRole("grid",{name:"戦場マップ"}).locator(`g[data-cell="${name(p)}"]`);
  await cell.click();await cell.click();
}

test("diagonal line formation selects supporter and enemy in the real offline PC/mobile battle",async({page,context})=>{
  await context.setOffline(true);
  await page.goto(app);
  const initial=await saved(page);
  const cleared=["easy-01","easy-02","easy-03"];
  const catalog=JSON.parse(readFileSync(resolve("docs/design/robot-tactics/missions.json"),"utf8")) as {missions:{id:string;firstClear:{unlock:{type:string;id:string}|null}}[]};
  const partLevels={...initial.progress.partLevels};
  for(const row of catalog.missions.filter(row=>cleared.includes(row.id))){
    const reward=row.firstClear.unlock;
    if(reward&&reward.type!=="frame"&&reward.type!=="frame-group")partLevels[reward.id]=1;
  }
  await replace(page,{...initial,revision:initial.revision+1,progress:{...initial.progress,cleared,partLevels}});
  await page.reload();
  await page.getByRole("button",{name:"ミッション選択",exact:true}).click();
  await page.getByRole("button",{name:/^M04 /}).click();
  await page.getByRole("button",{name:"Easy",exact:true}).click();
  await expect(page.getByRole("grid",{name:"戦場マップ"})).toBeVisible();
  for(let i=0;i<30;i++){
    const battle=(await saved(page)).battle;
    if(!battle)throw new Error("M04 ended before controlled turn");
    const s=battle.snapshot as unknown as RobotBattleCoreState;
    if(s.turn.actorId==="core-a")break;
    if(s.turn.actorId?.startsWith("core-")){
      await page.getByRole("navigation",{name:"戦闘操作"}).getByRole("button",{name:"待機",exact:true}).click();
      await page.getByRole("button",{name:"実行",exact:true}).click();
    }else await page.waitForTimeout(350);
  }
  const before=await saved(page),s=before.battle!.snapshot as unknown as RobotBattleCoreState;
  expect(s.turn.actorId).toBe("core-a");
  const target=s.units.find(u=>!["controlled","friendly-ai"].includes(u.kind)&&u.hp>0&&u.position);
  if(!target)throw new Error("No enemy for diagonal line");
  const active=s.units.find(u=>u.id==="core-a")!,support=s.units.find(u=>u.id==="core-b")!;
  expect(active.parts.some(p=>p.partId==="light-blade")).toBe(true);
  const blocked=[...s.board.walls,
    ...s.units.filter(u=>![active.id,support.id,target.id].includes(u.id)&&u.hp>0&&u.position).map(u=>u.position!),
    ...(s.objective.kind==="early"?s.objective.state.objects.objects.flatMap(o=>o.cells):[])];
  const free=(c:Cell)=>c.x>=0&&c.y>=0&&c.x<s.board.width&&c.y<s.board.height&&!blocked.some(b=>same(b,c));
  let positions:{source:Cell;support:Cell;enemy:Cell}|null=null;
  for(let y=1;y<s.board.height-1&&!positions;y++)for(let x=1;x<s.board.width-1&&!positions;x++){
    const source={x,y},support={x:x-1,y:y-1},enemy={x:x+1,y:y+1};
    if(free(source)&&free(support)&&free(enemy))positions={source,support,enemy};
  }
  if(!positions)throw new Error("No open three-cell diagonal in M04");
  const arranged={...before,battle:{...before.battle!,snapshot:{...s,units:s.units.map(u=>
    u.id===active.id?{...u,position:positions!.source,energy:{...u.energy,en:u.energy.maxEn}}:
    u.id===support.id?{...u,position:positions!.support}:
    u.id===target.id?{...u,position:positions!.enemy}:u)} as unknown as NonNullable<RobotOfflineSave["battle"]>["snapshot"]}};
  const options=getRobotFormationOptions(arranged.battle!.snapshot as unknown as RobotBattleCoreState,"line","light-blade");
  expect(options.disabledReason).toBeNull();
  expect(options.selections).toContainEqual({participantIds:[support.id],targetIds:[target.id]});
  await replace(page,arranged);await page.reload();
  await expect(page.getByRole("grid",{name:"戦場マップ"})).toBeVisible();
  const nav=page.getByRole("navigation",{name:"戦闘操作"});
  await nav.getByRole("button",{name:"連携",exact:true}).click();
  await page.getByLabel("行動の種類").selectOption("line:light-blade");
  await tap(page,positions.support);
  await tap(page,positions.enemy);
  await expect(page.getByRole("button",{name:"実行",exact:true})).toBeEnabled({timeout:8000});
  await page.getByRole("button",{name:"実行",exact:true}).click();
  await expect.poll(async()=>(await saved(page)).battle?.sequence).toBe(before.battle!.sequence+1);
  const after=await saved(page),resolved=after.battle!.snapshot as unknown as RobotBattleCoreState;
  expect(resolved.latest!.summary).toContain("ライン連携");
  expect(resolved.latest!.damage.some(d=>d.targetId===target.id&&(d.damage??0)>0)).toBe(true);
  expect(resolved.spentFormations).toContain("line");
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.reload();
  await expect(page.getByRole("grid",{name:"戦場マップ"})).toBeVisible();
  expect((await saved(page)).battle!.snapshot).toEqual(after.battle!.snapshot);
});
