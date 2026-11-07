import { expect, it } from "vitest";
import { earlyFormalAction, earlyFormalProgress } from "../robot-tactics/earlyFormalController";
import { createRobotOfflineSave, RobotOfflineSession, type RobotOfflineStorage } from "../../src/games/robot-tactics/offlineSession";
import { robotFormalRuntime } from "../../src/games/robot-tactics/formalRuntime";
import { createRobotFormalBattleState } from "../../src/games/robot-tactics/stageDeployment";
import { decodeRobotBattleCore, getRobotBattleResult, type RobotBattleCoreState } from "../../src/games/robot-tactics/battleState";
import { getRobotStagePlan } from "../../src/games/robot-tactics/stageCatalog";
import { finishRobotEarlyRound, robotEarlyGoalCells, spawnRobotEarlyWave } from "../../src/games/robot-tactics/earlyMissions";
import { robotCellToPosition as cell } from "../../src/games/robot-tactics/movement";
import { evaluateRobotSubobjective, getRobotSortieSubobjective, getRobotSubobjectiveAchieved } from "../../src/games/robot-tactics/subobjectives";
import { robotFormalBattleAdapter } from "../../src/client/games/robot-tactics/FormalBattleAdapter";
import { applyRobotOfflineOutcome } from "../../src/games/robot-tactics/offlineProgress";

class Storage implements RobotOfflineStorage {
  raw:string|null=null;fail=false;
  async read(){return this.raw;}
  async replace(expected:string|null,next:string){
    if(this.fail)throw new Error("disk-full");
    if(this.raw!==expected)throw new Error("stale");
    this.raw=next;
  }
}
const scene=(difficulty:"easy"|"normal"|"hard"="easy")=>{
  const key={missionNumber:13,difficulty};
  return createRobotFormalBattleState({battleId:"m13-unit",key,party:earlyFormalProgress(key).party});
};
const objective=(s:RobotBattleCoreState)=>{
  if(s.objective.kind!=="early")throw new Error("M13 early objective missing");
  return s.objective.state;
};
const at=(s:RobotBattleCoreState,id:string,pos:string):RobotBattleCoreState=>({
  ...s,units:s.units.map(u=>u.id===id?{...u,position:cell(pos)}:u),
});
const finish=(s:RobotBattleCoreState):RobotBattleCoreState=>({
  ...s,objective:{kind:"early" as const,state:finishRobotEarlyRound(s)},
});
for(const difficulty of ["easy","normal","hard"] as const){
  it(`M13 ${difficulty}: true formal battles, two consecutive bases, NPCs, save/reload and earned rewards`,async()=>{
    const key={missionNumber:13,difficulty},stage=getRobotStagePlan(key),progress=earlyFormalProgress(key),storage=new Storage();
    expect(stage.blockingIssues).toEqual([]);expect(stage.roundLimit).toBe(10);
    expect(stage.initialEnemies).toHaveLength(3);
    expect(stage.reinforcements.map(w=>[w.id,w.triggerRound])).toEqual([["round6-recapture",6]]);
    storage.raw=JSON.stringify({...createRobotOfflineSave(),progress});
    const session=new RobotOfflineSession(storage,robotFormalRuntime,()=> "m13-"+difficulty);
    await session.load();await session.start(key);
    let saved=false,seenOwnership=false,steps=0;
    for(;session.state.battle&&steps<420;steps++){
      const battle=session.state.battle,s=decodeRobotBattleCore(battle.snapshot),m=objective(s);
      expect(()=>robotFormalBattleAdapter.project(battle)).not.toThrow();
      expect(m.controlOwners).toHaveLength(3);
      expect(m.controlStreak).toBeLessThanOrEqual(2);
      seenOwnership ||= m.controlOwners.includes("allied");
      if(!saved&&s.allied.round>=3){
        const resume=new RobotOfflineSession(storage,robotFormalRuntime,()=> "unused");
        await resume.load();expect(resume.state).toEqual(session.state);saved=true;
      }
      if(m.spawnedWaveIds.includes("round6-recapture"))
        expect(s.units.filter(u=>u.squadId==="recapture-infantry")).toHaveLength(3);
      const action=earlyFormalAction(s),predicted=robotFormalRuntime.act(battle.snapshot,action,battle.departure);
      await session.act({battleId:battle.departure.battleId,expectedSequence:battle.sequence,actionId:"m13-"+steps,action});
      if(predicted.outcome)expect(session.state.result?.subobjectiveAchieved).toBe(predicted.outcome.subobjectiveAchieved);
    }
    expect(steps).toBeLessThan(420);expect(seenOwnership).toBe(true);expect(saved).toBe(true);
    expect(session.state.battle).toBeNull();
    expect(session.state.result).toMatchObject({result:"won"});
    expect(session.state.result!.endedRound).toBeLessThanOrEqual(10);
    const earned=applyRobotOfflineOutcome(progress,key,session.state.result!);
    expect(session.state.progress).toEqual(earned.progress);expect(session.state.result!.expGained).toBe(earned.expGained);
    const resumed=new RobotOfflineSession(storage,robotFormalRuntime,()=> "unused");
    await resumed.load();expect(resumed.state).toEqual(session.state);
  },30000);
}
it("M13 three objective cells and enemy units use the fixed layout",()=>{
  for(const difficulty of ["easy","normal","hard"] as const){
    const s=scene(difficulty),stage=getRobotStagePlan(s.key);
    expect(stage.board).toMatchObject({width:17,height:15});
    expect(robotEarlyGoalCells(s.key)).toEqual(["E5","I5","M5"].map(cell));
    expect(objective(s)).toMatchObject({controlOwners:["neutral","neutral","neutral"],controlStreak:0,objects:{objects:[]},waveDueRound:null});
    expect(stage.initialEnemies.map(u=>u.id)).toEqual(["west-base-guards","east-base-shooters","central-mobile"]);
    expect(stage.reinforcements.map(u=>u.id)).toEqual(["round6-recapture"]);
    expect(decodeRobotBattleCore(s)).toEqual(s);
  }
});
it("M13 control ownership counts friendly AI, resets on vacating, enemies contest by actual cell occupancy",()=>{
  let s=at(at(scene("normal"),"core-a","E5"),"friendly-1","I5");
  s=finish(s);
  expect(objective(s)).toMatchObject({controlOwners:["allied","allied","neutral"],controlStreak:1,result:"ongoing"});
  s=at(s,"core-a","G14");
  s=finish({...s,allied:{...s.allied,round:2}});
  expect(objective(s)).toMatchObject({controlOwners:["neutral","allied","neutral"],controlStreak:0,result:"ongoing"});
  s=at(at(s,"core-b","E5"),"core-c","M5");
  s=finish({...s,allied:{...s.allied,round:3}});
  expect(objective(s)).toMatchObject({controlOwners:["allied","allied","allied"],controlStreak:1,result:"ongoing"});
  s=finish({...s,allied:{...s.allied,round:4}});
  expect(objective(s)).toMatchObject({controlStreak:2,result:"won",resultReason:"bases-controlled"});
  expect(getRobotBattleResult(s).result).toBe("won");
  expect(getRobotSubobjectiveAchieved(s)).toBe(true);
});
it("M13 only the victory round requires 2 distinct controlled occupiers; friendly AI alone cannot satisfy Normal/Hard",()=>{
  for(const difficulty of ["normal","hard"] as const){
    let s=at(at(scene(difficulty),"core-a","E5"),"friendly-1","I5");
    s=finish(s);
    expect(objective(s).controlStreak).toBe(1);
    const same=finish({...s,allied:{...s.allied,round:2}});
    expect(objective(same).result).toBe("won");expect(getRobotSubobjectiveAchieved(same)).toBe(false);
    let two=at(s,"core-b","M5");
    two=finish({...two,allied:{...two.allied,round:2}});
    expect(objective(two)).toMatchObject({result:"won",controlOwners:["allied","allied","allied"]});
    expect(getRobotSubobjectiveAchieved(two)).toBe(true);
    // The same actors need not have occupied those bases during the preceding round.
    expect(evaluateRobotSubobjective({missionNumber:13,difficulty},{result:"won",round:2,winningRoundEnds:[{kind:"round-end",round:2,bases:[
      {cell:"0",allied:true,controlledId:"core-a"},{cell:"1",allied:true,controlledId:"core-b"},{cell:"2",allied:false},
    ],guardedIds:[],transportAdvance:0}]})).toBe(true);
    expect(evaluateRobotSubobjective({missionNumber:13,difficulty},{result:"lost",round:2,winningRoundEnds:[{kind:"round-end",round:2,bases:[
      {cell:"0",allied:true,controlledId:"core-a"},{cell:"1",allied:true,controlledId:"core-b"},
    ],guardedIds:[],transportAdvance:0}]})).toBe(false);
  }
});
it("M13 Easy sortie checks equipped slash/blunt/thrust and not mere ownership",()=>{
  const party=earlyFormalProgress({missionNumber:13,difficulty:"easy"}).party;
  const ready=party.map((unit,i)=>i===0?{...unit,basic:{...unit.basic,weapon1:{partId:"standard-sword",level:1}}}
    :i===1?{...unit,basic:{...unit.basic,weapon1:{partId:"heavy-hammer",level:1}}}
    :{...unit,basic:{...unit.basic,weapon1:{partId:"lance",level:1}}});
  expect(getRobotSortieSubobjective(13,ready)).toBe(true);
  expect(getRobotSortieSubobjective(13,ready.map((unit,i)=>i===1?{...unit,basic:{...unit.basic,weapon1:{partId:"standard-sword",level:1}}}:unit))).toBe(false);
});
it("M13 R6 recapture squad deploys exactly once, fallback or defer when blocked",()=>{
  const s=scene(),wave=getRobotStagePlan(s.key).reinforcements[0]!;
  expect(wave).toMatchObject({id:"round6-recapture",triggerType:"round-start",triggerRound:6});
  expect(wave.initialCells).toEqual(["H3","I3","J3"]);expect(wave.fallbackCells).toEqual(["G3","K3","H2","I2","J2"]);
  expect(spawnRobotEarlyWave(s,5,[]).spawned).toHaveLength(0);
  const spawned=spawnRobotEarlyWave(s,6,[]);
  expect(spawned.spawned).toEqual([{waveId:"round6-recapture",squadId:"recapture-infantry",cells:["H3","I3","J3"].map(cell)}]);
  expect(spawnRobotEarlyWave({...s,objective:{kind:"early",state:spawned.state}},7,[]).spawned).toHaveLength(0);
  const blocked=spawnRobotEarlyWave(s,6,["H3","I3","J3","G3","K3","H2","I2","J2"].map(cell));
  expect(blocked.spawned).toHaveLength(0);expect(blocked.deferredWaveIds).toEqual(["round6-recapture"]);
  const delayed=spawnRobotEarlyWave({...s,objective:{kind:"early",state:blocked.state}},7,[]);
  expect(delayed.spawned).toHaveLength(1);
});
it("M13 loses on the complete R10 when no two consecutive round ends succeeded",()=>{
  let s=scene();for(let r=1;r<=10;r++){
    s=finish({...s,allied:{...s.allied,round:r}});
  }
  expect(objective(s)).toMatchObject({controlStreak:0,result:"lost",resultReason:"round-limit"});
  expect(robotFormalRuntime.readiness({missionNumber:14,difficulty:"easy"}).length).toBeGreaterThan(0);
});
it("M13 rejects forged owners/streaks, illegal wave receipt and premature victory in saved state",()=>{
  const s=scene(),m=objective(s);
  for(const bad of [
    {...m,controlOwners:["allied","allied"],controlStreak:0},
    {...m,controlOwners:["allied","allied","neutral"],controlStreak:1},
    {...m,controlOwners:["neutral","neutral","neutral"],controlStreak:2},
    {...m,objects:{...m.objects,completedRound:10}},
    {...m,spawnedWaveIds:["round6-recapture"]},
    {...m,result:"won",resultReason:"bases-controlled",controlStreak:2},
    {...m,waveDueRound:2},
  ])expect(()=>decodeRobotBattleCore({...s,objective:{kind:"early",state:bad}})).toThrow();
});
it("M13 failed save write, duplicate action and retry retain party and reset base control",async()=>{
  const key={missionNumber:13,difficulty:"easy" as const},storage=new Storage(),progress=earlyFormalProgress(key);
  storage.raw=JSON.stringify({...createRobotOfflineSave(),progress});
  let counter=0;const session=new RobotOfflineSession(storage,robotFormalRuntime,()=> "m13-retry-"+(++counter));
  await session.load();await session.start(key);
  const before=session.state,battle=before.battle!,action=earlyFormalAction(decodeRobotBattleCore(battle.snapshot));
  const request={battleId:battle.departure.battleId,expectedSequence:battle.sequence,actionId:"m13-once",action};
  storage.fail=true;await expect(session.act(request)).rejects.toThrow("disk-full");expect(session.state).toEqual(before);
  storage.fail=false;await session.act(request);
  const committed=session.state;
  await session.act(request);expect(session.state).toEqual(committed);
  await session.retry(true);
  expect(session.state.progress).toEqual(progress);
  expect(session.state.battle!.departure.party).toEqual(battle.departure.party);
  expect(session.state.battle!.departure.battleId).not.toBe(battle.departure.battleId);
  expect(objective(decodeRobotBattleCore(session.state.battle!.snapshot))).toMatchObject({
    controlOwners:["neutral","neutral","neutral"],controlStreak:0,waveDueRound:null,spawnedWaveIds:[],result:"ongoing",
  });
});
