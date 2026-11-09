import { expect, test, type Page } from "@playwright/test";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { createRobotOfflineSave, type RobotOfflineSave } from "../../src/games/robot-tactics/offlineSession";
import { robotFormalRuntime } from "../../src/games/robot-tactics/formalRuntime";
import { getRobotActiveCombatOptions } from "../../src/games/robot-tactics/activeCombat";
import { decodeRobotBattleCore, getRobotBattleActor, getRobotBattleFacilities, getRobotBattleUnit, type RobotBattleCoreState } from "../../src/games/robot-tactics/battleState";

const fixture=pathToFileURL(resolve("test-results/robot-offline-fixture/index.html")).href;
async function save(page:Page):Promise<RobotOfflineSave>{
  const raw=await page.evaluate(()=>new Promise<string>((resolve,reject)=>{
    const r=indexedDB.open("robot-tactics-offline",1);r.onerror=()=>reject(r.error);
    r.onsuccess=()=>{const db=r.result,tx=db.transaction("checkpoints"),read=tx.objectStore("checkpoints").get("save");read.onerror=()=>reject(read.error);read.onsuccess=()=>{db.close();resolve(read.result as string);};};
  }));
  return JSON.parse(raw) as RobotOfflineSave;
}
function specialSave():RobotOfflineSave{
  const initial=createRobotOfflineSave();
  const progress={...initial.progress,cleared:["easy-01","easy-02","easy-03"]};
  const departure={battleId:"special-facility-e2e",key:{missionNumber:4,difficulty:"easy" as const},party:progress.party};
  let core=decodeRobotBattleCore(robotFormalRuntime.create(departure));
  let attempts=0;
  while(getRobotBattleActor(core).unitIds[0]!=="core-a"&&attempts++<60){
    const actor=getRobotBattleActor(core),unit=getRobotBattleUnit(core,actor.unitIds[0]!);
    const result=robotFormalRuntime.act(core as never,{kind:unit.kind==="controlled"?"wait":"npc"} as never,departure);
    core=decodeRobotBattleCore(result.snapshot);
  }
  if(getRobotBattleActor(core).unitIds[0]!=="core-a")throw new Error("M04 core-a did not become active");
  const depot=getRobotBattleFacilities(core).find(f=>f.id==="depot-left")!;
  let prepared:RobotBattleCoreState|null=null;
  for(let y=0;y<core.board.height&&!prepared;y++)for(let x=0;x<core.board.width&&!prepared;x++){
    if(!depot.cells.some(c=>Math.max(Math.abs(c.x-x),Math.abs(c.y-y))===2))continue;
    if(core.board.walls.some(c=>c.x===x&&c.y===y)||getRobotBattleFacilities(core).some(f=>f.cells.some(c=>c.x===x&&c.y===y))||core.units.some(u=>u.id!=="core-a"&&u.hp>0&&u.position?.x===x&&u.position.y===y))continue;
    const candidate={...core,units:core.units.map(u=>u.id==="core-a"?{...u,position:{x,y},energy:{...u.energy,moved:true}}:u)};
    if(getRobotActiveCombatOptions(candidate,"charge-strike","light-blade").targetIds.includes("depot-left"))prepared=candidate;
  }
  if(!prepared)throw new Error("No legal M04 charge position");
  robotFormalRuntime.validate(prepared as never,departure);
  return {...initial,revision:1,progress,battle:{runtimeId:robotFormalRuntime.id,runtimeVersion:robotFormalRuntime.version,departure,sequence:prepared.actionIds.length,committedActionIds:prepared.actionIds,snapshot:prepared as never,latestSummary:"M04特殊攻撃の試遊"},result:null};
}
test("M04 charge targets the depot in production map and commits one offline facility hit: desktop/mobile",async({page,context})=>{
  await context.setOffline(true);await page.goto(fixture);
  const injected=specialSave();
  await page.evaluate(raw=>new Promise<void>((resolve,reject)=>{
    const r=indexedDB.open("robot-tactics-offline",1);r.onerror=()=>reject(r.error);
    r.onsuccess=()=>{const db=r.result,tx=db.transaction("checkpoints","readwrite");tx.objectStore("checkpoints").put(raw,"save");tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};
  }),JSON.stringify(injected));
  await page.reload();await expect(page.getByRole("grid",{name:"戦場マップ"})).toBeVisible();
  const before=await save(page);
  await page.getByRole("navigation",{name:"戦闘操作"}).getByRole("button",{name:"攻撃",exact:true}).click();
  await page.getByLabel("行動の種類").selectOption("charge-strike:light-blade");
  const depot=page.getByRole("grid",{name:"戦場マップ"}).locator('g[data-cell="D3"]');
  await page.getByRole("button",{name:"俯瞰",exact:true}).click();
  await depot.click();await depot.click();
  await expect(page.getByRole("button",{name:"実行",exact:true})).toBeVisible();
  await page.getByRole("button",{name:"実行",exact:true}).click();
  await expect.poll(async()=>(await save(page)).battle!.sequence).toBe(before.battle!.sequence+1);
  const after=await save(page);
  const prev=decodeRobotBattleCore(before.battle!.snapshot),next=decodeRobotBattleCore(after.battle!.snapshot);
  expect(getRobotBattleFacilities(next).find(f=>f.id==="depot-left")!.hp).toBeLessThan(getRobotBattleFacilities(prev).find(f=>f.id==="depot-left")!.hp);
  expect(next.latest!.damage.some(e=>e.targetId==="depot-left")).toBe(true);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.reload();await expect(page.getByRole("grid",{name:"戦場マップ"})).toBeVisible();
  expect((await save(page)).battle!.snapshot).toEqual(after.battle!.snapshot);
});
