import {robotFormalBattleAdapter} from "../../src/client/games/robot-tactics/FormalBattleAdapter";
import {expect,it} from "vitest";
import {remainingFormalProgress,remainingFormalAction,type RemainingFormalCase} from "../robot-tactics/remainingFormalController";
import {RobotOfflineSession,createRobotOfflineSave,type RobotOfflineStorage} from "../../src/games/robot-tactics/offlineSession";
import {robotFormalRuntime} from "../../src/games/robot-tactics/formalRuntime";
import {decodeRobotBattleCore,getRobotBattleActor,getRobotBattleUnit} from "../../src/games/robot-tactics/battleState";
class Storage implements RobotOfflineStorage{
 raw:string;fail=false;
 constructor(kind:RemainingFormalCase){this.raw=JSON.stringify({...createRobotOfflineSave(),progress:remainingFormalProgress(kind)});}
 async read(){return this.raw;}async replace(expected:string|null,next:string){if(this.fail)throw new Error("disk-full");if(this.raw!==expected)throw new Error("stale");this.raw=next;}
}
for(const kind of ["extreme-lance-extension","sniper-penetration","thrust-linear-pierce","anti-materiel-focus","crush-immobilizer","function-lock-round","debuff-transfer-round","shared-victory-recovery-circuit"] as const)it(`real M01 ${kind}: Core action, durable checkpoint, failed-write replay/resume and retry`,async()=>{
 const storage=new Storage(kind);let id=0;const session=new RobotOfflineSession(storage,robotFormalRuntime,()=>"remaining-M01-"+ ++id);await session.load();await session.start({missionNumber:1,difficulty:kind==="shared-victory-recovery-circuit"||kind==="sniper-penetration"?"easy":"hard"});let resolved=false;
 for(let n=0;n<100;n++){
  const before=session.state,b=before.battle!;if(!b)throw new Error("M01 ended before test action: "+kind);
  expect(()=>robotFormalBattleAdapter.project(b)).not.toThrow();
  const s=decodeRobotBattleCore(b.snapshot),actor=getRobotBattleUnit(s,getRobotBattleActor(s).unitIds[0]!),action=remainingFormalAction(s,kind);
  const preview=kind==="shared-victory-recovery-circuit"?robotFormalRuntime.act(b.snapshot,action,b.departure):null;const newShared=preview!==null&&(decodeRobotBattleCore(preview.snapshot).sharedVictoryDefeats?.length??0)>(s.sharedVictoryDefeats?.length??0);
  const use=newShared||actor.id==="core-c"&&(action as {kind:string}).kind!=="move"&&(action as {kind:string}).kind!=="charge";
  const input={battleId:b.departure.battleId,expectedSequence:b.sequence,actionId:"step-"+n,action};
  if(use){storage.fail=true;await expect(session.act(input)).rejects.toThrow("disk-full");expect(session.state).toEqual(before);storage.fail=false;}
  await session.act(input);if(session.state.battle)expect(()=>robotFormalBattleAdapter.project(session.state.battle!)).not.toThrow();
  if(use && (kind!=="shared-victory-recovery-circuit" || newShared)){const save=session.state,after=decodeRobotBattleCore(save.battle!.snapshot);expect(after.latest!.damage.length).toBeGreaterThan(0);if(kind==="shared-victory-recovery-circuit"){expect(after.sharedVictoryDefeats?.length).toBeGreaterThan(0);expect(after.latest!.energyRecoveries?.length).toBeGreaterThan(0);}if(kind==="crush-immobilizer")expect(after.units.some(u=>u.rootedUntilOwnTurn!==undefined)).toBe(true);if(kind==="function-lock-round")expect(after.units.some(u=>u.energy.lockedUntilOwnTurn!==undefined)).toBe(true);await session.act(input);expect(session.state).toEqual(save);const reload=new RobotOfflineSession(storage,robotFormalRuntime,()=>"retry-remaining");await reload.load();expect(reload.state).toEqual(save);await reload.retry(true);expect(reload.state.battle!.sequence).toBe(0);expect(decodeRobotBattleCore(reload.state.battle!.snapshot).units.every(u=>u.rootedUntilOwnTurn===undefined&&u.energy.lockedUntilOwnTurn===undefined)).toBe(true);resolved=true;break;}
 }
 expect(resolved).toBe(true);
});
