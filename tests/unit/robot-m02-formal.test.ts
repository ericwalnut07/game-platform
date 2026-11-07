import { applyRobotOfflineOutcome,isRobotMissionUnlocked } from "../../src/games/robot-tactics/offlineProgress";
import { it,expect } from "vitest";
import { getRobotStagePlan } from "../../src/games/robot-tactics/stageCatalog";
import { createRobotFormalBattleState } from "../../src/games/robot-tactics/stageDeployment";
import { createRobotOfflineProgress } from "../../src/games/robot-tactics/offlineProgress";
import { robotFormalRuntime,robotBattleJson } from "../../src/games/robot-tactics/formalRuntime";
it("uses the already adopted M02 objective and unmodified roster for all difficulties",()=>{
 for(const difficulty of ["easy","normal","hard"] as const){const key={missionNumber:2,difficulty},stage=getRobotStagePlan(key),departure={battleId:"m02-"+difficulty,key,party:createRobotOfflineProgress().party},s=createRobotFormalBattleState(departure);expect(stage.blockingIssues).toEqual([]);expect(robotFormalRuntime.readiness(key)).toEqual([]);expect(s.objective.kind).toBe("m02");expect(s.units).toHaveLength(9);expect(stage.roundLimit).toBe(8);robotFormalRuntime.validate(robotBattleJson(s),departure);}
});
import { m02FormalProgress,m02PlayerAction } from "../robot-tactics/m02FormalController";
import { getRobotBattleActor,getRobotBattleUnit,decodeRobotBattleCore } from "../../src/games/robot-tactics/battleState";
import { RobotOfflineSession,createRobotOfflineSave,type RobotOfflineStorage } from "../../src/games/robot-tactics/offlineSession";
import { robotFormalBattleAdapter } from "../../src/client/games/robot-tactics/FormalBattleAdapter";
class Storage implements RobotOfflineStorage{raw:string;fail=false;constructor(difficulty:"easy"|"normal"|"hard"){this.raw=JSON.stringify({...createRobotOfflineSave(),progress:m02FormalProgress(difficulty)});}async read(){return this.raw;}async replace(expected:string|null,next:string){if(this.fail)throw new Error("disk-full");if(expected!==this.raw)throw new Error("stale");this.raw=next;}}
for(const difficulty of ["easy","normal","hard"] as const)it(`plays actual M02 ${difficulty} to a saved result with unchanged runtime/AI`,async()=>{
 const storage=new Storage(difficulty),session=new RobotOfflineSession(storage,robotFormalRuntime,()=>"real-m02-"+difficulty);await session.load();await session.start({missionNumber:2,difficulty});const actors=new Set<string>();const beforeProgress=session.state.progress;
 for(let n=0;session.state.battle&&n<250;n++){const b=session.state.battle,s=decodeRobotBattleCore(b.snapshot);expect(()=>robotFormalBattleAdapter.project(b)).not.toThrow();const actor=getRobotBattleUnit(s,getRobotBattleActor(s).unitIds[0]!);actors.add(actor.id);const action=m02PlayerAction(s);await session.act({battleId:b.departure.battleId,expectedSequence:b.sequence,actionId:"step-"+n,action});}
 expect(actors).toContain("commander");
 expect(session.state.battle).toBeNull();expect(session.state.result?.result).toBe("won");expect(session.state.result?.subobjectiveAchieved).toBe(difficulty!=="easy"&&session.state.result!.endedRound<=7);
 const terminal=robotFormalBattleAdapter.project(session.terminalPresentation!);expect(terminal.commands).toEqual([]);expect(terminal.queue).toEqual([]);expect(terminal.latestAction!.hits.some(h=>h.destroyed==="large")).toBe(true);
 const result=session.state.result!,expected=applyRobotOfflineOutcome(beforeProgress,{missionNumber:2,difficulty},result);expect(session.state.progress).toEqual(expected.progress);expect(result.expGained).toBe(expected.expGained);const restored=new RobotOfflineSession(storage,robotFormalRuntime,()=>"unused");await restored.load();expect(restored.state).toEqual(session.state);
},15000);

it("preserves mission unlocks and refuses M13+ instead of promoting unfinished objectives",async()=>{
 const storage=new Storage("easy"),session=new RobotOfflineSession(storage,robotFormalRuntime,()=>"M02-gates");storage.raw=JSON.stringify(createRobotOfflineSave());await session.load();const before=session.state;await expect(session.start({missionNumber:2,difficulty:"easy"})).rejects.toThrow();expect(session.state).toEqual(before);
 expect(robotFormalRuntime.readiness({missionNumber:13,difficulty:"easy"})).not.toEqual([]);expect(isRobotMissionUnlocked(m02FormalProgress(),{missionNumber:2,difficulty:"normal"})).toBe(false);
});
it("M02 action/save failure, replay, stale writer, reload and retry preserve one atomic checkpoint",async()=>{
 const storage=new Storage("easy");let serial=0;const session=new RobotOfflineSession(storage,robotFormalRuntime,()=>"M02-save-"+ ++serial);await session.load();await session.start({missionNumber:2,difficulty:"easy"});const other=new RobotOfflineSession(storage,robotFormalRuntime,()=>"unused");await other.load();
 const before=session.state,b=before.battle!,action=m02PlayerAction(decodeRobotBattleCore(b.snapshot)),input={battleId:b.departure.battleId,expectedSequence:b.sequence,actionId:"atomic",action},expected=robotFormalRuntime.act(b.snapshot,action,b.departure);
 storage.fail=true;await expect(session.act(input)).rejects.toThrow("disk-full");expect(session.state).toEqual(before);expect(JSON.parse(storage.raw)).toEqual(before);storage.fail=false;
 await session.act(input);const committed=session.state;expect(committed.battle!.snapshot).toEqual(expected.snapshot);await session.act(input);expect(session.state).toEqual(committed);await expect(other.act({...input,actionId:"other-writer"})).rejects.toThrow("stale");expect(JSON.parse(storage.raw)).toEqual(committed);
 const loaded=new RobotOfflineSession(storage,robotFormalRuntime,()=>"M02-retry");await loaded.load();expect(loaded.state).toEqual(committed);await loaded.retry(true);expect(loaded.state.battle!.sequence).toBe(0);expect(loaded.state.battle!.departure.key.missionNumber).toBe(2);const fresh=decodeRobotBattleCore(loaded.state.battle!.snapshot);expect(getRobotBattleUnit(fresh,"commander").hp).toBe(165);expect(getRobotBattleUnit(fresh,"commander").boss!.lastSkillOwnTurn).toBeNull();expect(loaded.state.progress).toEqual(before.progress);
});
it("legacy M01 runtime identity stays unchanged, and M02 canonical roster/objective corruption is rejected",()=>{
 expect(robotFormalRuntime.id).toBe("robot-tactics-formal-m01");const d={battleId:"M02-validate",key:{missionNumber:2,difficulty:"easy" as const},party:m02FormalProgress().party},s=createRobotFormalBattleState(d);robotFormalRuntime.validate(robotBattleJson(s),d);
 expect(()=>robotFormalRuntime.validate(robotBattleJson({...s,units:s.units.map(u=>u.id==="commander"?{...u,maxHp:150}:u)}),d)).toThrow();expect(()=>robotFormalRuntime.validate(robotBattleJson(s),{...d,key:{...d.key,missionNumber:1}})).toThrow();
 const old={...d,key:{missionNumber:1,difficulty:"easy" as const}},snapshot=robotFormalRuntime.create(old);expect(()=>robotFormalRuntime.validate(snapshot,old)).not.toThrow();
});

it("actual M02 reaches the adopted R8 timeout without a forged finish, rewards or R9",async()=>{
 const storage=new Storage("easy"),session=new RobotOfflineSession(storage,robotFormalRuntime,()=>"M02-timeout");await session.load();await session.start({missionNumber:2,difficulty:"easy"});
 for(const friend of decodeRobotBattleCore(session.state.battle!.snapshot).units.filter(u=>u.kind==="friendly-ai")){const b=session.state.battle!;await session.configureAi({battleId:b.departure.battleId,expectedSequence:b.sequence,configurationId:"hold-"+friend.id,change:{kind:"instruction",unitId:friend.id,instruction:{tacticId:"defend-location",cell:friend.position!}}});}
 const before=session.state.progress;let lastReason:string|null=null;
 for(let n=0;session.state.battle&&n<200;n++){const b=session.state.battle,s=decodeRobotBattleCore(b.snapshot),unit=getRobotBattleUnit(s,getRobotBattleActor(s).unitIds[0]!);expect(s.allied.round).toBeLessThanOrEqual(8);const action={kind:unit.kind==="controlled"?"defend":"npc"};const expected=robotFormalRuntime.act(b.snapshot,action,b.departure);if(expected.outcome){const ended=decodeRobotBattleCore(expected.snapshot);lastReason=ended.objective.kind==="m02"?ended.objective.reason:null;}await session.act({battleId:b.departure.battleId,expectedSequence:b.sequence,actionId:"timeout-"+n,action});}
 expect(session.state.battle).toBeNull();expect(session.state.result).toMatchObject({result:"lost",endedRound:8,expGained:0,subobjectiveAchieved:false});expect(lastReason).toBe("round-limit");expect(session.state.progress).toEqual(before);
},15000);
it("M02 cannot be completed by a client result/finish request",()=>{
 const d={battleId:"M02-no-forged-result",key:{missionNumber:2,difficulty:"easy" as const},party:m02FormalProgress().party},snapshot=robotFormalRuntime.create(d),before=JSON.stringify(snapshot);expect(()=>robotFormalRuntime.act(snapshot,{kind:"finish",result:"won"},d)).toThrow();expect(JSON.stringify(snapshot)).toBe(before);
});
