import { expect, it } from "vitest";
import { earlyFormalAction, earlyFormalProgress } from "../robot-tactics/earlyFormalController";
import { createRobotOfflineSave, RobotOfflineSession, type RobotOfflineStorage } from "../../src/games/robot-tactics/offlineSession";
import { robotFormalRuntime } from "../../src/games/robot-tactics/formalRuntime";
import { createRobotFormalBattleState } from "../../src/games/robot-tactics/stageDeployment";
import { decodeRobotBattleCore, getRobotBattleActor, getRobotBattleUnit, getRobotBattleResult, type RobotBattleCoreState } from "../../src/games/robot-tactics/battleState";
import { getRobotStagePlan } from "../../src/games/robot-tactics/stageCatalog";
import { recordRobotEarlyEntry, reconcileRobotEarlyMission, spawnRobotEarlyWave, finishRobotEarlyRound, robotEarlyGoalCells } from "../../src/games/robot-tactics/earlyMissions";
import { settleRobotBattleConsequences } from "../../src/games/robot-tactics/battleSettlement";
import { robotCellToPosition as cell } from "../../src/games/robot-tactics/movement";
import { getRobotSubobjectiveAchieved, evaluateRobotSubobjective } from "../../src/games/robot-tactics/subobjectives";
import { getRobotSortieSubobjective } from "../../src/games/robot-tactics/subobjectives";
import { applyRobotCustomization } from "../../src/games/robot-tactics/customization";
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
  const key={missionNumber:10,difficulty};
  return createRobotFormalBattleState({battleId:"m10-unit",key,party:earlyFormalProgress(key).party});
};
const mission=(s:RobotBattleCoreState)=>{
  if(s.objective.kind!=="early")throw new Error("M10 expected");
  return s.objective.state;
};
/** Test-only placement of a living controlled robot before committing a trusted
 * arrival. Actual gameplay always uses the legal path processor instead. */
function place(s:RobotBattleCoreState,id:string,at:string){
  const cellPosition=cell(at);
  return {...s,units:s.units.map(u=>u.id===id?{...u,position:cellPosition}:u)};
}
for(const difficulty of ["easy","normal","hard"] as const) {
  it(`M10 ${difficulty}: legal 8R battle, one-shot crossing response, saved checkpoint and earned result`,async()=>{
    const key={missionNumber:10,difficulty},stage=getRobotStagePlan(key),progress=earlyFormalProgress(key),storage=new Storage();
    expect(stage.blockingIssues).toEqual([]);expect(stage.roundLimit).toBe(8);
    expect(stage.objective.specification.kind).toBe("cross-enemy-line");
    expect(stage.initialEnemies).toHaveLength(3);expect(stage.reinforcements).toHaveLength(1);
    storage.raw=JSON.stringify({...createRobotOfflineSave(),progress});
    const session=new RobotOfflineSession(storage,robotFormalRuntime,()=>"m10-"+difficulty);
    await session.load();await session.start(key);
    let saved=false,firstCross=false,waveSeen=false,steps=0;
    for(;session.state.battle&&steps<350;steps++){
      const battle=session.state.battle,s=decodeRobotBattleCore(battle.snapshot),m=mission(s);
      expect(()=>robotFormalBattleAdapter.project(battle)).not.toThrow();
      if(m.arrivedIds.length)firstCross=true;
      if(m.spawnedWaveIds.includes("first-crossing-response")){
        waveSeen=true;
        expect(s.units.filter(u=>u.squadId==="rear-interceptors")).toHaveLength(3);
      }
      if(!saved && m.arrivedIds.length>=1){
        const restored=new RobotOfflineSession(storage,robotFormalRuntime,()=>"unused");
        await restored.load();expect(restored.state).toEqual(session.state);saved=true;
      }
      const actor=getRobotBattleUnit(s,getRobotBattleActor(s).unitIds[0]!);
      let action=earlyFormalAction(s);
      // Allow an entire round between first and second crossings to exercise
      // the adopted next-round reinforcement in this real combat, not a stub.
      if(actor.kind==="controlled"&&m.arrivedIds.length===1&&m.waveDueRound!==null&&
        s.allied.round<m.waveDueRound)action={kind:"defend"};
      const predicted=robotFormalRuntime.act(battle.snapshot,action,battle.departure);
      await session.act({battleId:battle.departure.battleId,expectedSequence:battle.sequence,actionId:"m10-step-"+steps,action});
      if(predicted.outcome)expect(session.state.result?.subobjectiveAchieved).toBe(predicted.outcome.subobjectiveAchieved);
    }
    expect(steps).toBeLessThan(350);
    expect(firstCross).toBe(true);expect(waveSeen).toBe(true);expect(saved).toBe(true);
    expect(session.state.battle).toBeNull();
    expect(session.state.result).toMatchObject({result:"won"});
    expect(session.state.result!.endedRound).toBeLessThanOrEqual(8);
    const earned=applyRobotOfflineOutcome(progress,key,session.state.result!);
    expect(session.state.progress).toEqual(earned.progress);
    expect(session.state.result!.expGained).toBe(earned.expGained);
    const restored=new RobotOfflineSession(storage,robotFormalRuntime,()=>"unused");
    await restored.load();expect(restored.state).toEqual(session.state);
  },30000);
}
it("M10 crossing counts permanently for controlled robots only; unique arrivals trigger exactly one next-round wave",()=>{
  const s=scene(),m=mission(s);
  expect(m).toMatchObject({arrivedIds:[],waveDueRound:null,spawnedWaveIds:[],m10DefeatedIds:[]});
  expect(robotEarlyGoalCells(s.key)).toEqual(["F2","G2","H2","I2","J2","K2","L2"].map(cell));
  const noNpc=recordRobotEarlyEntry(s,"friendly-1",cell("H2"));
  expect(mission(noNpc).arrivedIds).toEqual([]);
  const first=recordRobotEarlyEntry(place(s,"core-a","F2"),"core-a",cell("F2"));
  expect(mission(first).arrivedIds).toEqual(["core-a"]);
  expect(mission(first).waveDueRound).toBe(2);
  expect(mission(recordRobotEarlyEntry(first,"core-a",cell("L2"))).arrivedIds).toEqual(["core-a"]);
  expect(getRobotBattleResult(reconcileRobotEarlyMission(first)).result).toBe("ongoing");
  const occupied=first.units.filter(u=>u.hp>0).map(u=>u.position!);
  const due=spawnRobotEarlyWave(first,2,occupied);
  expect(due.spawned.map(x=>x.waveId)).toEqual(["first-crossing-response"]);
  expect(due.spawned[0]?.squadId).toBe("rear-interceptors");
  expect(due.spawned[0]?.cells).toHaveLength(3);
  expect(due.state.spawnedWaveIds).toEqual(["first-crossing-response"]);
  const repeated=spawnRobotEarlyWave({...first,objective:{kind:"early" as const,state:due.state}},3,occupied);
  expect(repeated.spawned).toEqual([]);
  const blocked=spawnRobotEarlyWave(first,2,[...occupied,...["H11","I11","J11","G11","K11","H12","I12","J12"].map(cell)]);
  expect(blocked.spawned).toEqual([]);expect(blocked.deferredWaveIds).toEqual(["first-crossing-response"]);
  expect(blocked.state.spawnedWaveIds).toEqual([]);
  const won=reconcileRobotEarlyMission(recordRobotEarlyEntry(place(first,"core-b","L2"),"core-b",cell("L2")));
  expect(getRobotBattleResult(won)).toMatchObject({result:"won",reason:"breakthrough-complete"});
  expect(mission(won).arrivedIds).toEqual(["core-a","core-b"]);
  expect(getRobotSubobjectiveAchieved(won)).toBe(false); // Easy loadout is not mobile+defense
  expect(decodeRobotBattleCore(JSON.parse(JSON.stringify(won))).units.filter(u => mission(won).arrivedIds.includes(u.id)).every(u => u.position === null)).toBe(true);
});
it("M10 first arriving robot's defeat before or after crossing invalidates Normal/Hard secondary goal",()=>{
  for(const difficulty of ["normal","hard"] as const){
    const s=scene(difficulty);
    const before=recordRobotEarlyEntry(place(s,"core-a","F2"),"core-a",cell("F2"));
    const defeated=settleRobotBattleConsequences(before,before.units.map(u=>u.id==="core-a"?{...u,hp:0}:u));
    expect(mission(defeated).m10DefeatedIds).toEqual(["core-a"]);
    expect(decodeRobotBattleCore(defeated)).toEqual(defeated);
    const won=reconcileRobotEarlyMission(recordRobotEarlyEntry(place(defeated,"core-b","L2"),"core-b",cell("L2")));
    expect(getRobotBattleResult(won).result).toBe("won");
    expect(getRobotSubobjectiveAchieved(won)).toBe(false);
    const hacked={...defeated,objective:{kind:"early" as const,state:{...mission(defeated),m10DefeatedIds:[]}}};
    expect(()=>decodeRobotBattleCore(hacked)).toThrow("defeat ledger");
    const ideal=reconcileRobotEarlyMission(recordRobotEarlyEntry(place(before,"core-b","L2"),"core-b",cell("L2")));
    expect(getRobotSubobjectiveAchieved(ideal)).toBe(true);
    expect(evaluateRobotSubobjective({missionNumber:10,difficulty},{result:"won",round:4,events:[
      {kind:"defeat",controlledId:"core-a"},{kind:"cross",controlledId:"core-a"},{kind:"cross",controlledId:"core-b"}]})).toBe(false);
    expect(evaluateRobotSubobjective({missionNumber:10,difficulty},{result:"won",round:4,events:[
      {kind:"cross",controlledId:"core-a"},{kind:"cross",controlledId:"core-b"},{kind:"defeat",controlledId:"core-a"}]})).toBe(false);
    expect(evaluateRobotSubobjective({missionNumber:10,difficulty},{result:"lost",round:4,events:[
      {kind:"cross",controlledId:"core-a"},{kind:"cross",controlledId:"core-b"}]})).toBe(false);
  }
});
it("M10 R8 timeout and M15 unready guard are strict",()=>{
  const s=scene();
  const pending={...s,allied:{...s.allied,round:8},objective:{kind:"early" as const,state:{...mission(s),objects:{...mission(s).objects,completedRound:7}}}};
  expect(finishRobotEarlyRound(pending)).toMatchObject({result:"lost",resultReason:"round-limit"});
  expect(robotFormalRuntime.readiness({missionNumber:15,difficulty:"easy"}).length).toBeGreaterThan(0);
});
it("M10 failed write, duplicate replay and retry preserve the equipment and save atomically",async()=>{
  const key={missionNumber:10,difficulty:"easy" as const},storage=new Storage(),progress=earlyFormalProgress(key);
  storage.raw=JSON.stringify({...createRobotOfflineSave(),progress});
  let counter=0;const session=new RobotOfflineSession(storage,robotFormalRuntime,()=>"m10-retry-"+(++counter));
  await session.load();await session.start(key);
  const before=session.state,battle=before.battle!,action=earlyFormalAction(decodeRobotBattleCore(battle.snapshot));
  const input={battleId:battle.departure.battleId,expectedSequence:battle.sequence,actionId:"m10-atomic",action};
  storage.fail=true;await expect(session.act(input)).rejects.toThrow("disk-full");expect(session.state).toEqual(before);
  storage.fail=false;await session.act(input);const committed=session.state;
  await session.act(input);expect(session.state).toEqual(committed);
  await session.retry(true);
  expect(session.state.progress).toEqual(progress);
  expect(session.state.battle!.departure.party).toEqual(battle.departure.party);
  expect(session.state.battle!.departure.battleId).not.toEqual(battle.departure.battleId);
  expect(mission(decodeRobotBattleCore(session.state.battle!.snapshot))).toMatchObject({arrivedIds:[],spawnedWaveIds:[],waveDueRound:null,m10DefeatedIds:[]});
});

it("M10 Easy subobjective uses equipped mobile and defense frames, not unlocks or ownership",()=>{
  const key={missionNumber:10,difficulty:"easy" as const},before=earlyFormalProgress(key);
  expect(getRobotSortieSubobjective(10,before.party)).toBe(false);
  const equipped=applyRobotCustomization(before,{kind:"frame",coreId:"core-a",frameId:"mobile-1"});
  expect(getRobotSortieSubobjective(10,equipped.party)).toBe(true);
  const departure={battleId:"m10-easy-sortie",key,party:equipped.party};
  const s=createRobotFormalBattleState(departure);
  expect(s.sortieSubobjectiveEligible).toBe(true);
  const crossed=recordRobotEarlyEntry(place(s,"core-a","F2"),"core-a",cell("F2"));
  const won=reconcileRobotEarlyMission(recordRobotEarlyEntry(place(crossed,"core-b","L2"),"core-b",cell("L2")));
  expect(getRobotBattleResult(won).result).toBe("won");
  expect(getRobotSubobjectiveAchieved(won)).toBe(true);
  expect(decodeRobotBattleCore(won).units.filter(u => mission(won).arrivedIds.includes(u.id)).every(u => u.position === null)).toBe(true);
});
