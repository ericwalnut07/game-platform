import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { RobotOfflineSave } from "../../src/games/robot-tactics/offlineSession";
import type { RobotBattleCoreState } from "../../src/games/robot-tactics/battleState";
import type { RobotPosition } from "../../src/games/robot-tactics/movement";

const h = createRequire(import.meta.url)(resolve("test-results/robot-formal-harness/controller.cjs")) as typeof import("./formalHarness");
const app=pathToFileURL(resolve("dist/robot-tactics-offline/index.html")).href;
async function saved(page: Page): Promise<RobotOfflineSave> {
  return page.evaluate(() => new Promise((resolve,reject) => {
    const request=indexedDB.open("robot-tactics-offline",1);
    request.onerror=()=>reject(request.error);
    request.onsuccess=()=>{
      const db=request.result, tx=db.transaction("checkpoints"), read=tx.objectStore("checkpoints").get("save");
      read.onsuccess=()=>{db.close();resolve(JSON.parse(read.result as string));};
      read.onerror=()=>{db.close();reject(read.error);};
    };
  }));
}
async function install(page:Page,value:RobotOfflineSave){
  await page.evaluate(raw=>new Promise<void>((resolve,reject)=>{
    const r=indexedDB.open("robot-tactics-offline",1);
    r.onerror=()=>reject(r.error);
    r.onsuccess=()=>{
      const db=r.result,tx=db.transaction("checkpoints","readwrite");
      tx.objectStore("checkpoints").put(raw,"save");
      tx.oncomplete=()=>{db.close();resolve();};
      tx.onerror=()=>{db.close();reject(tx.error);};
    };
  }),JSON.stringify(value));
}
const key=(p:RobotPosition)=>p.x+","+p.y;
type Scenario="combo"|"charge";
async function prepare(page:Page,context:BrowserContext,mode:Scenario){
  await context.setOffline(true);
  await page.clock.install();
  let progress=h.earlyFormalProgress({missionNumber:4,difficulty:"easy"});
  if(mode==="combo"){
    progress=h.applyRobotCustomization(progress,{kind:"part-equip",coreId:"core-a",slot:"weapon2",partId:"light-pistol"});
    progress=h.applyRobotCustomization(progress,{kind:"part-equip",coreId:"core-a",slot:"weapon1",partId:"assault-rifle"});
  }
  await page.goto(app);
  await page.getByRole("button",{name:"設定",exact:true}).click();
  page.once("dialog",d=>d.accept());
  await page.getByLabel("バックアップを読み込む",{exact:true}).setInputFiles({
    name:"special-facility-m04.json",mimeType:"application/json",
    buffer:Buffer.from(JSON.stringify({...h.createRobotOfflineSave(),progress})),
  });
  await expect.poll(async()=>(await saved(page)).progress.cleared.length).toBe(progress.cleared.length);
  await page.getByRole("button",{name:"ホーム",exact:true}).click();
  await page.getByRole("button",{name:"ミッション選択",exact:true}).click();
  await page.getByRole("button",{name:/^M04 /}).click();
  await page.getByRole("button",{name:"Easy",exact:true}).click();
  await expect(page.getByRole("grid",{name:"戦場マップ"})).toBeVisible();
  const initial=await saved(page),battle=initial.battle!;
  let snapshot=battle.snapshot, actions=0;
  for(;actions<40;actions++){
    const state=h.decodeRobotBattleCore(snapshot);
    if(h.getRobotBattleActor(state).unitIds.includes("core-a"))break;
    const action=h.earlyFormalAction(state);
    const next=h.robotFormalRuntime.act(snapshot,action,battle.departure);
    if(next.outcome)throw new Error("M04 ended before core-a turn");
    snapshot=next.snapshot;
  }
  if(actions===40)throw new Error("No core-a turn in M04");
  const s=h.decodeRobotBattleCore(snapshot),facility=s.objective.kind==="early"
    ? s.objective.state.objects.objects.find(o=>o.id==="depot-left") : null;
  if(!facility)throw new Error("Missing adopted M04 left depot");
  const occupied=new Set([...s.board.walls,...s.units.filter(u=>u.hp>0&&u.position&&u.id!=="core-a").map(u=>u.position!),...s.objective.state.objects.objects.flatMap(o=>o.cells)].map(key));
  const targetCommand=mode==="combo"?"combo":"charge-strike:light-blade";
  let selected:{core:RobotBattleCoreState;position:RobotPosition}|null=null;
  const around=[...new Map(facility.cells.flatMap(c=>
    Array.from({length:81},(_,i)=>({x:c.x+i%9-4,y:c.y+Math.floor(i/9)-4}))).map(c=>[key(c),c])).values()];
  for(const position of around){
    if(position.x<0||position.y<0||position.x>=s.board.width||position.y>=s.board.height||occupied.has(key(position)))continue;
    const trial={...s,units:s.units.map(u=>u.id==="core-a"?{...u,position,energy:{...u.energy,moved:mode==="charge"}}:u)};
    let valid:RobotBattleCoreState;
    try{valid=h.decodeRobotBattleCore(trial);}catch{continue;}
    const view=h.robotFormalBattleAdapter.project({...battle,snapshot:valid,sequence:actions});
    if(view.choices.some(c=>c.commandId===targetCommand&&c.selection.targetIds.includes(facility.id))){
      selected={core:valid,position};break;
    }
  }
  if(!selected)throw new Error("No legal M04 depot targeting position for "+mode);
  const changed:RobotOfflineSave={...initial,battle:{
    ...battle,snapshot:selected.core as unknown as NonNullable<RobotOfflineSave["battle"]>["snapshot"],
    sequence:actions,committedActionIds:Array.from({length:actions},(_,i)=>"special-stage-setup-"+i),
  }};
  await install(page,changed);
  await page.reload();
  await expect(page.getByRole("grid",{name:"戦場マップ"})).toBeVisible();
  const before=await saved(page);
  expect(before.battle?.sequence).toBe(actions);
  return{before,facilityId:facility.id,cell:facility.cells[0]!,position:selected.position,commandId:targetCommand};
}
for(const mode of ["combo","charge"] as const)test(`M04 ${mode} selects hostile depot, damages one shared HP pool, saves and reloads offline PC/mobile`,async({page,context})=>{
  const {before,facilityId,cell,position,commandId}=await prepare(page,context,mode);
  const nav=page.getByRole("navigation",{name:"戦闘操作"});
  await nav.getByRole("button",{name:mode==="combo"?"特殊":"攻撃",exact:true}).click();
  await page.getByLabel("行動の種類",{exact:true}).selectOption(commandId);
  const preview= h.robotFormalBattleAdapter.project(before.battle!);
  expect(preview.choices.some(c=>c.commandId===commandId&&c.selection.targetIds.includes(facilityId))).toBe(true);
  await page.getByRole("button",{name:"俯瞰",exact:true}).click();
  const grid=page.getByRole("grid",{name:"戦場マップ"});
  const tile=grid.locator(`g[data-cell="${String.fromCharCode(65+cell.x)}${cell.y+1}"]`);
  await tile.click();
  await expect(page.getByRole("button",{name:"実行",exact:true})).toBeEnabled();
  expect(await saved(page)).toEqual(before);
  await page.getByRole("button",{name:"実行",exact:true}).click();
  await expect.poll(async()=>(await saved(page)).battle!.sequence).toBe(before.battle!.sequence+1);
  const after=await saved(page),b=h.decodeRobotBattleCore(before.battle!.snapshot),a=h.decodeRobotBattleCore(after.battle!.snapshot);
  const oldFacility=b.objective.kind==="early"?b.objective.state.objects.objects.find(o=>o.id===facilityId)!:null;
  const newFacility=a.objective.kind==="early"?a.objective.state.objects.objects.find(o=>o.id===facilityId)!:null;
  expect(newFacility!.hp).toBeLessThan(oldFacility!.hp);
  expect(a.latest!.damage.filter(d=>d.targetId===facilityId&&d.damage!==null)).toHaveLength(1);
  expect(a.units.find(u=>u.id==="core-a")!.energy.action).not.toBeNull();
  if(mode==="charge"){
    expect(a.units.find(u=>u.id==="core-a")!.position).not.toEqual(position);
    expect(newFacility!.cells).not.toContainEqual(a.units.find(u=>u.id==="core-a")!.position);
  }
  await page.clock.runFor(1500);
  await page.reload();
  await expect(page.getByRole("grid",{name:"戦場マップ"})).toBeVisible();
  expect(await saved(page)).toEqual(after);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
