import {expect,it} from "vitest";
import {hazardFormalAction,hazardFormalCases,hazardFormalProgress} from "../robot-tactics/hazardFormalController";
import {RobotOfflineSession,createRobotOfflineSave,type RobotOfflineStorage} from "../../src/games/robot-tactics/offlineSession";
import {robotFormalRuntime} from "../../src/games/robot-tactics/formalRuntime";
import {decodeRobotBattleCore,getRobotBattleUnit} from "../../src/games/robot-tactics/battleState";
import {robotFormalBattleAdapter} from "../../src/client/games/robot-tactics/FormalBattleAdapter";
class Storage implements RobotOfflineStorage{raw:string|null=null;fail=false;async read(){return this.raw;}async replace(expected:string|null,next:string){if(this.fail)throw new Error("disk-full");if(this.raw!==expected)throw new Error("stale-write");this.raw=next;}}
for(const kind of hazardFormalCases)it(`real M01 ${kind}: actual NPC, one action, CAS/replay, save/resume and fresh retry`,async()=>{
 const storage=new Storage();storage.raw=JSON.stringify({...createRobotOfflineSave(),progress:hazardFormalProgress(kind)});let serial=0;let session=new RobotOfflineSession(storage,robotFormalRuntime,()=>"hazard-smoke-"+ ++serial);await session.load();await session.start({missionNumber:1,difficulty:"hard"});let exercised=false,observedTick=false,retried=false;
 for(let n=0;n<100&&session.state.battle;n++){
  const b=session.state.battle,s=decodeRobotBattleCore(b.snapshot),action=hazardFormalAction(s,kind),special=(action as {kind:string}).kind===kind||(action as {mode?:string}).mode==="fire";expect(()=>robotFormalBattleAdapter.project(b)).not.toThrow();
  const input={battleId:b.departure.battleId,expectedSequence:b.sequence,actionId:"hazard-"+n,action},expected=robotFormalRuntime.act(b.snapshot,action,b.departure),before=session.state;
  if(special&&!exercised){storage.fail=true;await expect(session.act(input)).rejects.toThrow("disk-full");expect(session.state).toEqual(before);storage.fail=false;}
  await session.act(input);const saved=session.state;if(saved.battle)expect(saved.battle.snapshot).toEqual(expected.snapshot);await session.act(input);expect(session.state).toEqual(saved);
  if(special&&!exercised){expect(saved.battle).not.toBeNull();const now=decodeRobotBattleCore(saved.battle!.snapshot);expect(now.hazards!.zones.some(z=>z.kind===kind)).toBe(true);expect(getRobotBattleUnit(now,"core-c").energy.action).toMatchObject({kind:"other",energyCost:kind==="movement-interference-field"?10:15});session=new RobotOfflineSession(storage,robotFormalRuntime,()=>"hazard-resume-"+ ++serial);await session.load();expect(session.state).toEqual(saved);exercised=true;}
  const next=decodeRobotBattleCore(expected.snapshot);if(next.latest!.damage.some(d=>d.effectKind===(kind==="proximity-mine"?"special:mine":"special:blast-fire")))observedTick=true;
  if(exercised&&!retried){await session.retry(true);const fresh=decodeRobotBattleCore(session.state.battle!.snapshot);expect(fresh.hazards?.zones??[]).toEqual([]);expect(session.state.progress).toEqual(before.progress);retried=true;}
  if(retried&&(observedTick||kind==="movement-interference-field"))break;
 }
 expect(exercised&&retried).toBe(true);if(kind!=="movement-interference-field")expect(observedTick).toBe(true);
},15000);
