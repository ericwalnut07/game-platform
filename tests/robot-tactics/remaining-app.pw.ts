import {expect,test,type Page} from "@playwright/test";
import {createRequire} from "node:module";
import {resolve} from "node:path";
import {mkdirSync} from "node:fs";
import {pathToFileURL} from "node:url";
import type {RobotOfflineSave} from "../../src/games/robot-tactics/offlineSession";
import type {RobotPosition} from "../../src/games/robot-tactics/movement";
const h=createRequire(import.meta.url)(resolve("test-results/robot-formal-harness/controller.cjs")) as typeof import("./formalHarness");
async function saved(page:Page):Promise<RobotOfflineSave>{return page.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open("robot-tactics-offline",1);r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,read=db.transaction("checkpoints").objectStore("checkpoints").get("save");read.onsuccess=()=>{db.close();resolve(JSON.parse(read.result as string));};read.onerror=()=>reject(read.error);};}));}
async function tap(page:Page,cell:RobotPosition){
 await page.getByRole("button",{name:"俯瞰",exact:true}).click();const name=String.fromCharCode(65+cell.x)+(cell.y+1);const target=page.getByRole("grid").locator(`g[data-cell="${name}"]`);await target.click();await target.click();
}
async function npc(page:Page,before:number){for(let n=0;n<10;n++){await page.clock.runFor(400);if((await saved(page)).battle?.sequence!==before)return;}throw new Error("NPC checkpoint did not advance");}
for(const kind of ["extreme-lance-extension","sniper-penetration","thrust-linear-pierce","anti-materiel-focus","crush-immobilizer","function-lock-round","debuff-transfer-round","shared-victory-recovery-circuit"] as const)test(`production M01 ${kind}: actual selection, VFX, atomic save, reload and retry`,async({page,context},info)=>{
 await context.setOffline(true);await page.clock.install();await page.goto(pathToFileURL(resolve("dist/robot-tactics-offline/index.html")).href);
 const progress=h.remainingFormalProgress(kind);await page.getByRole("button",{name:"設定",exact:true}).click();page.once("dialog",d=>d.accept());
 await page.getByLabel("バックアップを読み込む",{exact:true}).setInputFiles({name:"earned-remaining-addons.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify({...h.createRobotOfflineSave(),progress}))});
 await expect.poll(async()=>(await saved(page)).progress.party[2]!.addons.length).toBe(progress.party[2]!.addons.length);
 await page.getByRole("button",{name:"ホーム",exact:true}).click();await page.getByRole("button",{name:"ミッション選択",exact:true}).click();await page.getByRole("button",{name:/^M01 /}).click();await page.getByRole("button",{name:kind==="shared-victory-recovery-circuit"||kind==="sniper-penetration"?"Easy":"Hard",exact:true}).click();await expect(page.getByRole("grid")).toBeVisible();await page.clock.pauseAt(new Date(Date.now()+1000));
 let complete=false,failedWrite=false;
 for(let n=0;n<100;n++){
  const before=await saved(page),b=before.battle!;if(!b)throw new Error("M01 ended before addon use");const s=h.decodeRobotBattleCore(b.snapshot),actor=h.getRobotBattleUnit(s,h.getRobotBattleActor(s).unitIds[0]!),action=h.remainingFormalAction(s,kind) as unknown as {kind:string;weaponId?:string;targetId?:string;targetIds?:string[];destination?:RobotPosition};
  const use=actor.id==="core-c"&&!["move","charge"].includes(action.kind);
  if(actor.kind!=="controlled"){await npc(page,b.sequence);continue;}
  const category=action.kind==="move"?"移動":action.kind==="normal"?"攻撃":"特殊";
  const categoryButton=page.getByRole("navigation",{name:"戦闘操作"}).getByRole("button",{name:category,exact:true});await expect(categoryButton).toBeEnabled({timeout:10000});await categoryButton.click();
  const id=action.kind==="move"||action.kind==="charge"?action.kind:action.kind+":"+action.weaponId!;await page.getByLabel("行動の種類",{exact:true}).selectOption(id);
  if(action.destination)await tap(page,action.destination);
  for(const targetId of action.targetIds??(action.targetId?[action.targetId]:[]))await tap(page,h.getRobotBattleUnit(s,targetId).position!);
  expect(await saved(page)).toEqual(before);
  if(use&&!failedWrite){
   await page.evaluate(()=>{const put=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(this:IDBObjectStore,value:unknown,key?:IDBValidKey){IDBObjectStore.prototype.put=put;if(this.name==="checkpoints")throw new DOMException("disk-full","QuotaExceededError");return put.call(this,value,key!);};});
   await page.getByRole("button",{name:"実行",exact:true}).click();await expect(page.getByRole("alert").last()).toBeVisible();expect(await saved(page)).toEqual(before);failedWrite=true;
  }
  const expected=use?h.robotFormalRuntime.act(b.snapshot,JSON.parse(JSON.stringify(action)),b.departure):null;
  await page.getByRole("button",{name:"実行",exact:true}).evaluate((button:HTMLButtonElement)=>{button.click();button.click();});await expect.poll(async()=>(await saved(page)).battle!.sequence).toBe(b.sequence+1);
  const checkpoint=await saved(page),after=h.decodeRobotBattleCore(checkpoint.battle!.snapshot);
  if(use && (kind!=="shared-victory-recovery-circuit"||after.sharedVictoryDefeats?.length)){
   expect(after.units).toEqual(h.decodeRobotBattleCore(expected!.snapshot).units);expect(after.latest!.damage).toEqual(h.decodeRobotBattleCore(expected!.snapshot).latest!.damage);
   if(kind==="crush-immobilizer")expect(after.units.some(u=>u.rootedUntilOwnTurn!==undefined)).toBe(true);if(kind==="function-lock-round")expect(after.units.some(u=>u.energy.lockedUntilOwnTurn!==undefined)).toBe(true);if(kind==="debuff-transfer-round")expect(after.latest!.damage[1]!.damage).toBeNull();
   for(let frame=0;frame<20&&await page.locator('.robot-battle-fx').count()===0;frame++)await page.clock.runFor(40);await expect(page.locator('.robot-battle-fx')).not.toHaveCount(0);
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight)).toBe(true);
   mkdirSync("test-results/robot-vfx-review",{recursive:true});await page.screenshot({path:`test-results/robot-vfx-review/${info.project.name}-M01-${kind}.png`});
   await page.reload();expect(await saved(page)).toEqual(checkpoint);await expect(page.locator('.robot-battle-fx')).toHaveCount(0);
   await page.getByRole("button",{name:"オプション",exact:true}).click();page.once("dialog",d=>d.accept());await page.getByRole("button",{name:"再挑戦",exact:true}).click();await expect.poll(async()=>(await saved(page)).battle!.sequence).toBe(0);expect(h.decodeRobotBattleCore((await saved(page)).battle!.snapshot).sharedVictoryDefeats).toBeUndefined();complete=true;break;
  }
 }
 expect(complete).toBe(true);
});
