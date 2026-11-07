import {expect,it} from "vitest";
import {earlyFormalAction,earlyFormalProgress} from "../robot-tactics/earlyFormalController";
import {RobotOfflineSession,createRobotOfflineSave,type RobotOfflineStorage} from "../../src/games/robot-tactics/offlineSession";
import {robotFormalRuntime} from "../../src/games/robot-tactics/formalRuntime";
import {decodeRobotBattleCore} from "../../src/games/robot-tactics/battleState";
import {applyRobotOfflineOutcome} from "../../src/games/robot-tactics/offlineProgress";
import {robotFormalBattleAdapter} from "../../src/client/games/robot-tactics/FormalBattleAdapter";
class Storage implements RobotOfflineStorage{raw:string|null=null;async read(){return this.raw;}async replace(expected:string|null,next:string){if(this.raw!==expected)throw new Error("stale");this.raw=next;}}
for(const missionNumber of [3,4,5,6,7])for(const difficulty of ["easy","normal","hard"] as const)it(`actual formal M0${missionNumber} ${difficulty}: combat/NPC to victory, rewards and durable result`,async()=>{
 const key={missionNumber,difficulty},progress=earlyFormalProgress(key),storage=new Storage();storage.raw=JSON.stringify({...createRobotOfflineSave(),progress});const session=new RobotOfflineSession(storage,robotFormalRuntime,()=>`M${missionNumber}-${difficulty}`);await session.load();await session.start(key);let steps=0, subobjective=false;
 for(;session.state.battle&&steps<300;steps++){const b=session.state.battle,s=decodeRobotBattleCore(b.snapshot),action=earlyFormalAction(s);expect(()=>robotFormalBattleAdapter.project(b)).not.toThrow();const resolved=robotFormalRuntime.act(b.snapshot,action,b.departure);if(resolved.outcome)subobjective=resolved.outcome.subobjectiveAchieved;await session.act({battleId:b.departure.battleId,expectedSequence:b.sequence,actionId:"step-"+steps,action});}
 expect(session.state.battle).toBeNull();expect(session.state.result,JSON.stringify(session.state.result)).toMatchObject({result:"won",subobjectiveAchieved:subobjective});const expected=applyRobotOfflineOutcome(progress,key,session.state.result!);expect(session.state.progress).toEqual(expected.progress);expect(session.state.result!.expGained).toBe(expected.expGained);const restored=new RobotOfflineSession(storage,robotFormalRuntime,()=>"unused");await restored.load();expect(restored.state).toEqual(session.state);
 console.log(`M${missionNumber} ${difficulty} R${session.state.result!.endedRound} ${steps} checkpoints`);
},30000);
