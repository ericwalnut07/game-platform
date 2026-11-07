import { expect, it } from "vitest";
import { earlyFormalAction, earlyFormalProgress } from "../robot-tactics/earlyFormalController";
import { createRobotOfflineSave, RobotOfflineSession, type RobotOfflineStorage } from "../../src/games/robot-tactics/offlineSession";
import { robotFormalRuntime } from "../../src/games/robot-tactics/formalRuntime";
import { createRobotFormalBattleState, createRobotFormalReinforcement } from "../../src/games/robot-tactics/stageDeployment";
import { advanceRobotBattleRound, beginRobotBattleTurn, commitRobotBattleData, commitRobotBattlePassive, decodeRobotBattleCore, getRobotBattlePendingActors, getRobotBattleResult, getRobotBattleUnit, robotBattleTurnId, type RobotBattleCoreState } from "../../src/games/robot-tactics/battleState";
import { getRobotStagePlan } from "../../src/games/robot-tactics/stageCatalog";
import { ROBOT_M14_DATA_ID, finishRobotEarlyRound, getRobotEarlyDataAction, reconcileRobotEarlyMission, recordRobotM14PursuerKill, robotEarlyGoalCells, spawnRobotEarlyWave } from "../../src/games/robot-tactics/earlyMissions";
import { robotCellToPosition as cell } from "../../src/games/robot-tactics/movement";
import { evaluateRobotSubobjective, getRobotSortieSubobjective, getRobotSubobjectiveAchieved } from "../../src/games/robot-tactics/subobjectives";
import { robotFormalBattleAdapter } from "../../src/client/games/robot-tactics/FormalBattleAdapter";
import { applyRobotOfflineOutcome } from "../../src/games/robot-tactics/offlineProgress";
import { applyRobotPhaseDamage } from "../../src/games/robot-tactics/battleEffects";
import { commitRobotBattleNormalAttack, getRobotBattleNormalAttackOptions } from "../../src/games/robot-tactics/battleWeaponActions";
import { settleRobotBattleConsequences } from "../../src/games/robot-tactics/battleSettlement";

class Storage implements RobotOfflineStorage {
 raw:string|null=null;fail=false;
 async read(){return this.raw;}
 async replace(expected:string|null,next:string){if(this.fail)throw new Error("disk-full");if(this.raw!==expected)throw new Error("stale");this.raw=next;}
}
const scene=(difficulty:"easy"|"normal"|"hard"="easy")=>{
 const key={missionNumber:14,difficulty};
 const {initiative:_initiative,...core}=createRobotFormalBattleState({battleId:"m14-unit",key,party:earlyFormalProgress(key).party});
 return core;
};
const objective=(s:RobotBattleCoreState)=>{
 if(s.objective.kind!=="early")throw new Error("M14 early objective missing");
 return s.objective.state;
};
const at=(s:RobotBattleCoreState,id:string,pos:string):RobotBattleCoreState=>({
 ...s,units:s.units.map(u=>u.id===id?{...u,position:cell(pos)}:u),
});
const fullRound=(initial:RobotBattleCoreState):RobotBattleCoreState=>{
 let s=initial;
 while(getRobotBattlePendingActors(s).length){
  if(!s.turn.actorId)s=beginRobotBattleTurn(s,getRobotBattlePendingActors(s)[0]!.id);
  s=commitRobotBattlePassive(s,{actionId:"m14-wait-"+s.actionIds.length,turnId:robotBattleTurnId(s),kind:"wait"});
 }
 return advanceRobotBattleRound(s,w=>createRobotFormalReinforcement(getRobotStagePlan(s.key),w));
};
for(const difficulty of ["easy","normal","hard"] as const)
 it(`M14 ${difficulty}: legal full battle with data pickup, pursuit, upload, resume and rewards`,async()=>{
  const key={missionNumber:14,difficulty},stage=getRobotStagePlan(key),progress=earlyFormalProgress(key),storage=new Storage();
  expect(stage.blockingIssues).toEqual([]);expect(stage.roundLimit).toBe(12);
  storage.raw=JSON.stringify({...createRobotOfflineSave(),progress});
  const session=new RobotOfflineSession(storage,robotFormalRuntime,()=> "m14-"+difficulty);
  await session.load();await session.start(key);
  let gotData=false,spawned=false,reviewed=false,steps=0,foundKill=false;
  for(;session.state.battle&&steps<540;steps++){
   const battle=session.state.battle,s=decodeRobotBattleCore(battle.snapshot),m=objective(s);
   expect(()=>robotFormalBattleAdapter.project(battle)).not.toThrow();
   gotData ||=m.data!.collectedRound!==null;
   spawned ||=m.spawnedWaveIds.includes("data-pursuers");
   foundKill ||=!!m.m14PursuerKill;
   if(m.spawnedWaveIds.includes("data-pursuers"))expect(s.units.filter(u=>u.squadId==="return-raiders")).toHaveLength(3);
   if(!reviewed&&m.data!.collectedRound!==null){
    const recovery=new RobotOfflineSession(storage,robotFormalRuntime,()=> "unused");
    await recovery.load();expect(recovery.state).toEqual(session.state);
    reviewed=true;
   }
   const action=earlyFormalAction(s),expected=robotFormalRuntime.act(battle.snapshot,action,battle.departure);
   await session.act({battleId:battle.departure.battleId,expectedSequence:battle.sequence,actionId:"m14-"+steps,action});
   if(expected.outcome)expect(session.state.result?.subobjectiveAchieved).toBe(expected.outcome.subobjectiveAchieved);
  }
  expect(steps).toBeLessThan(540);expect(gotData).toBe(true);expect(spawned).toBe(true);expect(reviewed).toBe(true);
  expect(session.state.battle).toBeNull();expect(session.state.result).toMatchObject({result:"won"});
  expect(session.state.result!.endedRound).toBeLessThanOrEqual(12);
  const earned=applyRobotOfflineOutcome(progress,key,session.state.result!);
  expect(session.state.progress).toEqual(earned.progress);
  expect(session.state.result!.expGained).toBe(earned.expGained);
  const after=new RobotOfflineSession(storage,robotFormalRuntime,()=> "unused");
  await after.load();expect(after.state).toEqual(session.state);
  expect(typeof foundKill).toBe("boolean");
 },30000);

it("M14 fixed adopted positions, heavy guardian not mandatory and direct-only pickup",()=>{
 for(const difficulty of ["easy","normal","hard"] as const){
  const s=scene(difficulty),stage=getRobotStagePlan(s.key);
  expect(stage.board).toMatchObject({width:17,height:15});
  expect(robotEarlyGoalCells(s.key)).toEqual(["J3","I13"].map(cell));
  expect(stage.initialEnemies.map(e=>e.id)).toEqual(["terminal-defenders","west-crossfire","artillery-guardian"]);
  expect(stage.reinforcements.map(w=>[w.id,w.triggerType])).toEqual([["data-pursuers","data-collected"]]);
  expect(objective(s).data).toEqual({cell:cell("J3"),carrierId:null,sent:false,collectedRound:null});
  expect(objective(s).m14PursuerKill).toBeNull();
  expect(()=>decodeRobotBattleCore(s)).not.toThrow();
  expect(getRobotEarlyDataAction(s,"friendly-1","pickup")).toBeTruthy();
 }
});

it("M14 retrieves data with EN0, schedules next-round pursuit once, and uploads only at I13",()=>{
 let s=beginRobotBattleTurn(at(scene(),"core-a","J3"),"core-a");
 expect(getRobotEarlyDataAction(s,"core-a","pickup")).toBeNull();
 s=commitRobotBattleData(s,{actionId:"m14-get",turnId:robotBattleTurnId(s),kind:"pickup"});
 expect(objective(s).data).toMatchObject({cell:null,carrierId:"core-a",collectedRound:1,sent:false});
 expect(objective(s).waveDueRound).toBe(2);
 expect(getRobotBattleUnit(s,"core-a").carriedObjectiveId).toBe(ROBOT_M14_DATA_ID);
 expect(getRobotBattleUnit(s,"core-a").energy.action).toMatchObject({kind:"other",energyCost:0});
 expect(()=>decodeRobotBattleCore(s)).not.toThrow();
 s=fullRound(s);
 expect(s.allied.round).toBe(2);
 expect(objective(s).spawnedWaveIds).toEqual(["data-pursuers"]);
 expect(s.units.filter(u=>u.squadId==="return-raiders")).toHaveLength(3);
 expect(spawnRobotEarlyWave(s,3,[]).spawned).toEqual([]);
 s=beginRobotBattleTurn(at(s,"core-a","I13"),"core-a");
 expect(getRobotEarlyDataAction(s,"core-a","transmit")).toBeNull();
 s=commitRobotBattleData(s,{actionId:"m14-send",turnId:robotBattleTurnId(s),kind:"transmit"});
 expect(objective(s)).toMatchObject({result:"won",resultReason:"data-transmitted",data:{cell:null,carrierId:null,sent:true}});
 expect(getRobotBattleUnit(s,"core-a").carriedObjectiveId).toBeNull();
 expect(()=>decodeRobotBattleCore(s)).not.toThrow();
});

it("M14 defeated data carrier drops at final cell; another controlled unit can retrieve",()=>{
 let s=beginRobotBattleTurn(at(scene(),"core-a","J3"),"core-a");
 s=commitRobotBattleData(s,{actionId:"get",turnId:robotBattleTurnId(s),kind:"pickup"});
 const moved=at(s,"core-a","K12");
 const hit=applyRobotPhaseDamage(moved,"artillery-guardian","core-a",getRobotBattleUnit(moved,"core-a").hp,"kill-carrier","blast");
 const defeated=settleRobotBattleConsequences(moved,hit.state.units,[],hit.state);
 expect(objective(defeated).data).toMatchObject({cell:cell("K12"),carrierId:null,sent:false,collectedRound:1});
 expect(getRobotBattleUnit(defeated,"core-a").carriedObjectiveId).toBeNull();
 expect(objective(defeated).waveDueRound).toBe(2);
 let another=at(defeated,"core-b","K12");
 another=beginRobotBattleTurn(another,"core-b");
 another=commitRobotBattleData(another,{actionId:"recover",turnId:robotBattleTurnId(another),kind:"pickup"});
 expect(objective(another).data).toMatchObject({carrierId:"core-b",cell:null,collectedRound:1});
 expect(getRobotBattleUnit(another,"core-b").carriedObjectiveId).toBe(ROBOT_M14_DATA_ID);
 expect(()=>decodeRobotBattleCore(another)).not.toThrow();
});

it("M14 pursuit reinforcement spawns one intact wave on next round, fallback or defer",()=>{
 const s=scene(),wave=getRobotStagePlan(s.key).reinforcements[0]!;
 expect(wave.id).toBe("data-pursuers");
 expect(wave.initialCells).toEqual(["L12","M12","N12"]);
 expect(wave.fallbackCells).toEqual(["L11","M11","N11","L13","M13","N13"]);
 expect(spawnRobotEarlyWave(s,2,[]).spawned).toEqual([]);
 const due=reconcileRobotEarlyMission({...s,objective:{kind:"early",state:{...objective(s),data:{cell:null,carrierId:"core-a",sent:false,collectedRound:1}}},units:s.units.map(u=>u.id==="core-a"?{...u,carriedObjectiveId:ROBOT_M14_DATA_ID}:u)});
 expect(objective(due).waveDueRound).toBe(2);
 expect(spawnRobotEarlyWave(due,1,[]).spawned).toHaveLength(0);
 const initial=spawnRobotEarlyWave(due,2,[]);
 expect(initial.spawned).toEqual([{waveId:"data-pursuers",squadId:"return-raiders",cells:wave.initialCells.map(cell)}]);
 expect(spawnRobotEarlyWave({...due,objective:{kind:"early",state:initial.state}},3,[]).spawned).toHaveLength(0);
 const blocked=spawnRobotEarlyWave(due,2,[...wave.initialCells,...wave.fallbackCells].map(cell));
 expect(blocked.spawned).toHaveLength(0);expect(blocked.deferredWaveIds).toEqual(["data-pursuers"]);
 expect(spawnRobotEarlyWave({...due,objective:{kind:"early",state:blocked.state}},3,[]).spawned).toHaveLength(1);
});

it("M14 Normal/Hard only credited controlled kill of post-pickup pursuer before upload",()=>{
 for(const difficulty of ["normal","hard"] as const){
  const key={missionNumber:14,difficulty};
  let s=beginRobotBattleTurn(at(scene(difficulty),"core-a","J3"),"core-a");
  s=commitRobotBattleData(s,{actionId:"take",turnId:robotBattleTurnId(s),kind:"pickup"});
  s=fullRound(s);
  const victim=getRobotBattleUnit(s,"return-raiders:1");
  expect(victim.hp).toBeGreaterThan(0);
  const hit={attackId:"m14-trusted-hit",sourceId:"core-b",targetId:victim.id,cells:[victim.position!],damage:victim.hp,effectKind:"assault" as const};
  const death={...s,attackIds:[...s.attackIds,hit.attackId],units:s.units.map(u=>u.id===victim.id?{...u,hp:0}:u)};
  const recorded=recordRobotM14PursuerKill(s,death,[hit]);
  expect(objective(recorded).m14PursuerKill).toEqual({attackId:hit.attackId,sourceId:"core-b",targetId:victim.id});
  const uncredited=recordRobotM14PursuerKill(s,death,[{...hit,sourceId:"friendly-1"}]);
  expect(objective(uncredited).m14PursuerKill).toBeNull();
  const forged={...recorded,objective:{kind:"early" as const,state:{...objective(recorded),m14PursuerKill:{...objective(recorded).m14PursuerKill!,sourceId:"friendly-1"}}}};
  expect(()=>decodeRobotBattleCore(forged)).toThrow("M14");
  expect(evaluateRobotSubobjective(key,{result:"won",round:5,events:[
   {kind:"pickup"},{kind:"damage",sourceId:"core-b",source:"controlled",targetId:victim.id,target:"enemy",lethal:true,hpRemoved:1,waveId:"data-pursuers"},{kind:"upload"},
  ]})).toBe(true);
  expect(evaluateRobotSubobjective(key,{result:"won",round:5,events:[
   {kind:"pickup"},{kind:"upload"},{kind:"damage",sourceId:"core-b",source:"controlled",targetId:victim.id,target:"enemy",lethal:true,hpRemoved:1,waveId:"data-pursuers"},
  ]})).toBe(false);
 }
});
it("M14 trusted damage settlement records a real lethal controlled normal action before upload",()=>{
 let s=beginRobotBattleTurn(at(scene(),"core-a","J3"),"core-a");
 s=commitRobotBattleData(s,{actionId:"secure-pickup",turnId:robotBattleTurnId(s),kind:"pickup"});
 s=fullRound(s);
 s=at(s,"core-b","K12");
 s={...s,units:s.units.map(u=>u.id==="return-raiders:1"?{...u,hp:1}:u)};
 s=beginRobotBattleTurn(s,"core-b");
 const attacker=getRobotBattleUnit(s,"core-b");
 const part=attacker.parts.find(p=>getRobotBattleNormalAttackOptions(s,p.partId).targetIds.includes("return-raiders:1"));
 expect(part,"controlled member must have a legal equipped normal weapon").toBeDefined();
 const next=commitRobotBattleNormalAttack(s,{actionId:"m14-real-kill",turnId:robotBattleTurnId(s),weaponId:part!.partId,targetId:"return-raiders:1"});
 expect(getRobotBattleUnit(next,"return-raiders:1").hp).toBe(0);
 expect(objective(next).m14PursuerKill).toMatchObject({sourceId:"core-b",targetId:"return-raiders:1"});
 expect(next.attackIds).toContain(objective(next).m14PursuerKill!.attackId);
 expect(()=>decodeRobotBattleCore(next)).not.toThrow();
});
it("M14 Easy sortie requires three distinct equipped first-weapon families",()=>{
 const party=earlyFormalProgress({missionNumber:14,difficulty:"easy"}).party;
 const build=party.map((u,i)=>({...u,basic:{...u.basic,weapon1:{partId:["standard-sword","heavy-hammer","lance"][i]!,level:1}}}));
 expect(getRobotSortieSubobjective(14,build)).toBe(true);
 expect(getRobotSortieSubobjective(14,build.map(u=>({...u,basic:{...u.basic,weapon1:build[0]!.basic.weapon1}})))).toBe(false);
});
it("M14 R12 full-round deadline, duplicate wave and invalid data/kill snapshots are rejected",()=>{
 let s=scene();
 for(let r=1;r<=12;r++){s={...s,allied:{...s.allied,round:r}};s={...s,objective:{kind:"early",state:finishRobotEarlyRound(s)}};}
 expect(objective(s)).toMatchObject({result:"lost",resultReason:"round-limit"});
 const fresh=scene(),m=objective(fresh);
 for(const bad of [
  {...m,objects:{...m.objects,completedRound:99}},
  {...m,result:"won" as const,resultReason:"data-transmitted" as const},
  {...m,m14PursuerKill:{sourceId:"core-a",targetId:"return-raiders:1",attackId:"unknown"}},
  {...m,spawnedWaveIds:["data-pursuers"]},
  {...m,data:{...m.data!,collectedRound:1}},
  {...m,waveDueRound:2},
 ])expect(()=>decodeRobotBattleCore({...fresh,objective:{kind:"early",state:bad}})).toThrow();
 expect(robotFormalRuntime.readiness({missionNumber:15,difficulty:"easy"}).length).toBeGreaterThan(0);
});
it("M14 failed storage write, duplicate action, retry and departure equipment remain atomic",async()=>{
 const key={missionNumber:14,difficulty:"easy" as const},storage=new Storage(),progress=earlyFormalProgress(key);
 storage.raw=JSON.stringify({...createRobotOfflineSave(),progress});let index=0;
 const session=new RobotOfflineSession(storage,robotFormalRuntime,()=> "m14-retry-"+(++index));
 await session.load();await session.start(key);
 const before=session.state,battle=before.battle!,action=earlyFormalAction(decodeRobotBattleCore(battle.snapshot));
 const input={battleId:battle.departure.battleId,expectedSequence:battle.sequence,actionId:"m14-once",action};
 storage.fail=true;await expect(session.act(input)).rejects.toThrow("disk-full");expect(session.state).toEqual(before);
 storage.fail=false;await session.act(input);const committed=session.state;
 await session.act(input);expect(session.state).toEqual(committed);
 await session.retry(true);
 expect(session.state.progress).toEqual(progress);
 expect(session.state.battle!.departure.party).toEqual(battle.departure.party);
 expect(session.state.battle!.departure.battleId).not.toBe(battle.departure.battleId);
 const fresh=objective(decodeRobotBattleCore(session.state.battle!.snapshot));
 expect(fresh).toMatchObject({waveDueRound:null,spawnedWaveIds:[],data:{cell:cell("J3"),carrierId:null,sent:false,collectedRound:null},m14PursuerKill:null,result:"ongoing"});
});
