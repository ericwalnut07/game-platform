import { expect, it } from "vitest";
import { earlyFormalAction, earlyFormalProgress } from "../robot-tactics/earlyFormalController";
import { createRobotOfflineSave, RobotOfflineSession, type RobotOfflineStorage } from "../../src/games/robot-tactics/offlineSession";
import { robotFormalRuntime } from "../../src/games/robot-tactics/formalRuntime";
import { createRobotFormalBattleState } from "../../src/games/robot-tactics/stageDeployment";
import { decodeRobotBattleCore, getRobotBattleResult, type RobotBattleCoreState } from "../../src/games/robot-tactics/battleState";
import { getRobotStagePlan } from "../../src/games/robot-tactics/stageCatalog";
import { reconcileRobotEarlyMission, finishRobotEarlyRound, spawnRobotEarlyWave } from "../../src/games/robot-tactics/earlyMissions";
import { robotCellToPosition as cell } from "../../src/games/robot-tactics/movement";
import { getRobotSortieSubobjective, getRobotSubobjectiveAchieved } from "../../src/games/robot-tactics/subobjectives";
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
  const key={missionNumber:11,difficulty};
  return createRobotFormalBattleState({battleId:"m11-unit",key,party:earlyFormalProgress(key).party});
};
const mission=(s:RobotBattleCoreState)=>{
  if(s.objective.kind!=="early")throw new Error("M11 early objective missing");
  return s.objective.state;
};

for(const difficulty of ["easy","normal","hard"] as const){
  it(`M11 ${difficulty}: 9R legal combat, one retaliation wave, saved checkpoint, victory and earned reward`,async()=>{
    const key={missionNumber:11,difficulty},stage=getRobotStagePlan(key),progress=earlyFormalProgress(key),storage=new Storage();
    expect(stage.blockingIssues).toEqual([]);expect(stage.roundLimit).toBe(9);
    expect(stage.initialEnemies).toHaveLength(3);expect(stage.reinforcements.map(w=>w.id)).toEqual(["depot-retaliation"]);
    storage.raw=JSON.stringify({...createRobotOfflineSave(),progress});
    const session=new RobotOfflineSession(storage,robotFormalRuntime,()=> "m11-"+difficulty);
    await session.load();await session.start(key);
    let saved=false,firstDestroyed=false,waveSeen=false,steps=0;
    for(;session.state.battle&&steps<400;steps++){
      const battle=session.state.battle,s=decodeRobotBattleCore(battle.snapshot),m=mission(s);
      expect(m.objects.objects).toHaveLength(2);
      expect(()=>robotFormalBattleAdapter.project(battle)).not.toThrow();
      if(m.objects.objects.some(o=>o.hp===0))firstDestroyed=true;
      if(m.spawnedWaveIds.includes("depot-retaliation")){
        waveSeen=true;expect(s.units.filter(u=>u.squadId==="depot-counterattack")).toHaveLength(3);
      }
      if(!saved&&firstDestroyed){
        const restored=new RobotOfflineSession(storage,robotFormalRuntime,()=> "unused");
        await restored.load();expect(restored.state).toEqual(session.state);saved=true;
      }
      let action=earlyFormalAction(s);
      // Keep the second depot intact until the first destruction has had its
      // mandated following-round retaliation, without skipping any NPC turn.
      if(m.objects.objects.filter(o=>o.hp===0).length===1&&m.waveDueRound!==null&&s.allied.round<m.waveDueRound&&
        ["normal","blast"].includes((action as {kind:string}).kind))action={kind:"defend"};
      const predicted=robotFormalRuntime.act(battle.snapshot,action,battle.departure);
      await session.act({battleId:battle.departure.battleId,expectedSequence:battle.sequence,actionId:"m11-step-"+steps,action});
      if(predicted.outcome)expect(session.state.result?.subobjectiveAchieved).toBe(predicted.outcome.subobjectiveAchieved);
    }
    expect(steps).toBeLessThan(400);
    expect(firstDestroyed).toBe(true);expect(saved).toBe(true);expect(waveSeen).toBe(true);
    expect(session.state.battle).toBeNull();
    expect(session.state.result).toMatchObject({result:"won"});
    expect(session.state.result!.endedRound).toBeLessThanOrEqual(9);
    const earned=applyRobotOfflineOutcome(progress,key,session.state.result!);
    expect(session.state.progress).toEqual(earned.progress);
    expect(session.state.result!.expGained).toBe(earned.expGained);
    const restored=new RobotOfflineSession(storage,robotFormalRuntime,()=> "unused");
    await restored.load();expect(restored.state).toEqual(session.state);
  },30000);
}

it("M11 independent two-cell HP pools, next-round one-shot retaliation, fallback/defer",()=>{
  const s=scene(),m=mission(s),[west,east]=m.objects.objects;
  expect(west).toMatchObject({id:"depot-west",maxHp:140,def:28,cells:[cell("D3"),cell("E3")]});
  expect(east).toMatchObject({id:"depot-east",maxHp:140,def:28,cells:[cell("M3"),cell("N3")]});
  const hit={attackId:"m11-west-one",sourceId:"core-a",hitCells:[cell("D3"),cell("E3")],damage:west!.maxHp};
  const after=reconcileRobotEarlyMission({...s,attackIds:[hit.attackId]},[hit]);
  expect(mission(after).objects.objects[0]!.hp).toBe(0);
  expect(mission(after).objects.objects[1]!.hp).toBe(east!.maxHp);
  expect(mission(after).m11FinalBlows).toEqual({"depot-west":{sourceId:"core-a",attackId:hit.attackId}});
  expect(mission(after).waveDueRound).toBe(2);
  expect(getRobotBattleResult(after).result).toBe("ongoing");
  expect(decodeRobotBattleCore(JSON.parse(JSON.stringify(after)))).toEqual(after);
  const occupied=s.units.filter(u=>u.hp>0).map(u=>u.position!);
  const spawn=spawnRobotEarlyWave(after,2,occupied);
  expect(spawn.spawned).toHaveLength(1);
  expect(spawn.spawned[0]!.waveId).toBe("depot-retaliation");
  expect(spawn.spawned[0]!.cells).toHaveLength(3);
  expect(spawn.state.spawnedWaveIds).toEqual(["depot-retaliation"]);
  const repeated=spawnRobotEarlyWave({...after,objective:{kind:"early" as const,state:spawn.state}},3,occupied);
  expect(repeated.spawned).toEqual([]);
  const blocked=spawnRobotEarlyWave(after,2,[...occupied,...["H4","I4","J4","G4","K4","H3","I3","J3"].map(cell)]);
  expect(blocked.spawned).toEqual([]);expect(blocked.deferredWaveIds).toEqual(["depot-retaliation"]);
  expect(blocked.state.spawnedWaveIds).toEqual([]);
  const second={attackId:"m11-east-two",sourceId:"core-b",hitCells:east!.cells,damage:east!.hp};
  const won=reconcileRobotEarlyMission({...after,attackIds:[...after.attackIds,second.attackId]},[second]);
  expect(getRobotBattleResult(won)).toMatchObject({result:"won",reason:"depots-destroyed"});
  expect(mission(won).m11FinalBlows).toEqual({"depot-west":{sourceId:"core-a",attackId:hit.attackId},"depot-east":{sourceId:"core-b",attackId:second.attackId}});
  expect(decodeRobotBattleCore(won)).toEqual(won);
});

it("M11 Normal/Hard require different controlled final-blow actors; ally AI and same actor do not count",()=>{
  for(const difficulty of ["normal","hard"] as const){
    const original=scene(difficulty),[west,east]=mission(original).objects.objects;
    const first={attackId:"west-controlled",sourceId:"core-a",hitCells:west!.cells,damage:west!.maxHp};
    const state=reconcileRobotEarlyMission({...original,attackIds:[first.attackId]},[first]);
    expect(getRobotBattleResult(state).result).toBe("ongoing");
    for(const [source,expected] of [["core-b",true],["core-a",false],["friendly-1",false]] as const){
      const second={attackId:"east-"+source,sourceId:source,hitCells:east!.cells,damage:east!.maxHp};
      const won=reconcileRobotEarlyMission({...state,attackIds:[...state.attackIds,second.attackId]},[second]);
      expect(getRobotBattleResult(won).result).toBe("won");
      expect(getRobotSubobjectiveAchieved(won)).toBe(expected);
      expect(decodeRobotBattleCore(won)).toEqual(won);
    }
    const forgery={...state,objective:{kind:"early" as const,state:{...mission(state),m11FinalBlows:{}}}};
    expect(()=>decodeRobotBattleCore(forgery)).toThrow("M11");
    const wrongSource={...state,objective:{kind:"early" as const,state:{...mission(state),m11FinalBlows:{"depot-west":{sourceId:"nobody",attackId:first.attackId}}}}};
    expect(()=>decodeRobotBattleCore(wrongSource)).toThrow("M11");
  }
});

it("M11 Easy subobjective uses equipped blunt+blast among weapon slots",()=>{
  const key={missionNumber:11,difficulty:"easy" as const},progress=earlyFormalProgress(key);
  expect(getRobotSortieSubobjective(11,progress.party)).toBe(false);
  const party=progress.party.map((unit,i)=>i===0?{...unit,basic:{...unit.basic,weapon1:{partId:"heavy-hammer",level:1}}}:i===1?{...unit,basic:{...unit.basic,weapon2:{partId:"light-grenade-launcher",level:1}}}:unit);
  expect(getRobotSortieSubobjective(11,party)).toBe(true);
  const withoutBlast=party.map((unit,i)=>i===1?progress.party[1]!:unit);
  expect(getRobotSortieSubobjective(11,withoutBlast)).toBe(false);
});

it("M11 R9 timeout and M15 unready guard remain strict",()=>{
  const s=scene(),m=mission(s);
  const pending={...s,allied:{...s.allied,round:9},objective:{kind:"early" as const,state:{...m,objects:{...m.objects,completedRound:8}}}};
  expect(finishRobotEarlyRound(pending)).toMatchObject({result:"lost",resultReason:"round-limit"});
  expect(robotFormalRuntime.readiness({missionNumber:15,difficulty:"easy"}).length).toBeGreaterThan(0);
});

it("M11 failed storage write, duplicate replay and retry keep the original earned departure",async()=>{
  const key={missionNumber:11,difficulty:"easy" as const},storage=new Storage(),progress=earlyFormalProgress(key);
  storage.raw=JSON.stringify({...createRobotOfflineSave(),progress});
  let counter=0;const session=new RobotOfflineSession(storage,robotFormalRuntime,()=> "m11-retry-"+(++counter));
  await session.load();await session.start(key);
  const before=session.state,battle=before.battle!,action=earlyFormalAction(decodeRobotBattleCore(battle.snapshot));
  const input={battleId:battle.departure.battleId,expectedSequence:battle.sequence,actionId:"m11-atomic",action};
  storage.fail=true;await expect(session.act(input)).rejects.toThrow("disk-full");expect(session.state).toEqual(before);
  storage.fail=false;await session.act(input);const committed=session.state;
  await session.act(input);expect(session.state).toEqual(committed);
  await session.retry(true);expect(session.state.progress).toEqual(progress);
  expect(session.state.battle!.departure.party).toEqual(battle.departure.party);
  expect(session.state.battle!.departure.battleId).not.toEqual(battle.departure.battleId);
  expect(mission(decodeRobotBattleCore(session.state.battle!.snapshot))).toMatchObject({waveDueRound:null,spawnedWaveIds:[],m11FinalBlows:{},result:"ongoing"});
});
