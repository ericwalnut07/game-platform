import { expect, it } from "vitest";
import { earlyFormalAction, earlyFormalProgress } from "../robot-tactics/earlyFormalController";
import { createRobotOfflineSave, RobotOfflineSession, type RobotOfflineStorage } from "../../src/games/robot-tactics/offlineSession";
import { robotFormalRuntime } from "../../src/games/robot-tactics/formalRuntime";
import { createRobotFormalBattleState } from "../../src/games/robot-tactics/stageDeployment";
import { decodeRobotBattleCore, getRobotBattleResult, getRobotBattleStructures, type RobotBattleCoreState } from "../../src/games/robot-tactics/battleState";
import { getRobotStagePlan } from "../../src/games/robot-tactics/stageCatalog";
import { finishRobotEarlyRound, reconcileRobotEarlyMission, robotEarlyGoalCells, spawnRobotEarlyWave } from "../../src/games/robot-tactics/earlyMissions";
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
  const key={missionNumber:12,difficulty};
  return createRobotFormalBattleState({battleId:"m12-unit",key,party:earlyFormalProgress(key).party});
};
const mission=(s:RobotBattleCoreState)=>{
  if(s.objective.kind!=="early")throw new Error("M12 early objective missing");
  return s.objective.state;
};
const move=(s:RobotBattleCoreState,id:string,at:string)=>({
  ...s,units:s.units.map(u=>u.id===id?{...u,position:cell(at)}:u),
});

for (const difficulty of ["easy","normal","hard"] as const) {
  it(`M12 ${difficulty}: real ten-round escort, R5 rear squad, checkpoint, reward and resume`, async()=>{
    const key={missionNumber:12,difficulty},stage=getRobotStagePlan(key),progress=earlyFormalProgress(key),storage=new Storage();
    expect(stage.roundLimit).toBe(10);
    expect(stage.blockingIssues).toEqual([]);
    expect(stage.initialEnemies).toHaveLength(3);
    expect(stage.reinforcements.map(w=>[w.id,w.triggerType,w.triggerRound])).toEqual([["round5-crossfire","round-start",5]]);
    storage.raw=JSON.stringify({...createRobotOfflineSave(),progress});
    const session=new RobotOfflineSession(storage,robotFormalRuntime,()=> "m12-"+difficulty);
    await session.load();await session.start(key);
    let saved=false,waveSeen=false,advanced=false,steps=0,lastRound=1,lastRoute=0;
    for(;session.state.battle&&steps<440;steps++){
      const battle=session.state.battle,s=decodeRobotBattleCore(battle.snapshot),m=mission(s),convoy=m.objects.objects[0]!;
      expect(()=>robotFormalBattleAdapter.project(battle)).not.toThrow();
      expect(convoy.id).toBe("convoy");
      expect(convoy.routeIndex).toBeGreaterThanOrEqual(lastRoute);
      expect(convoy.routeIndex).toBeLessThanOrEqual(8);
      if(s.allied.round!==lastRound){
        expect(convoy.routeIndex).toBeLessThanOrEqual(lastRoute+1);
        lastRound=s.allied.round;
      }
      lastRoute=convoy.routeIndex;
      advanced ||=convoy.routeIndex>0;
      if(m.spawnedWaveIds.includes("round5-crossfire")){
        waveSeen=true;
        expect(s.units.filter(u=>u.squadId==="rear-shooters")).toHaveLength(3);
      }
      if(!saved&&s.allied.round>=5){
        const restored=new RobotOfflineSession(storage,robotFormalRuntime,()=> "unused");
        await restored.load();
        expect(restored.state).toEqual(session.state);
        saved=true;
      }
      const action=earlyFormalAction(s);
      const predicted=robotFormalRuntime.act(battle.snapshot,action,battle.departure);
      await session.act({battleId:battle.departure.battleId,expectedSequence:battle.sequence,actionId:"m12-step-"+steps,action});
      if(predicted.outcome)expect(session.state.result?.subobjectiveAchieved).toBe(predicted.outcome.subobjectiveAchieved);
    }
    expect(steps).toBeLessThan(440);
    expect(saved).toBe(true);expect(waveSeen).toBe(true);expect(advanced).toBe(true);
    expect(session.state.battle).toBeNull();
    expect(session.state.result).toMatchObject({result:"won"});
    expect(session.state.result!.endedRound).toBeLessThanOrEqual(10);
    const earned=applyRobotOfflineOutcome(progress,key,session.state.result!);
    expect(session.state.progress).toEqual(earned.progress);
    expect(session.state.result!.expGained).toBe(earned.expGained);
    const restored=new RobotOfflineSession(storage,robotFormalRuntime,()=> "unused");
    await restored.load();expect(restored.state).toEqual(session.state);
  },30000);
}

it("M12 exact adopted convoy HP/DEF, nine route cells and one free step at each completed round",()=>{
  for(const difficulty of ["easy","normal","hard"] as const){
    const s=scene(difficulty),stage=getRobotStagePlan(s.key),c=mission(s).objects.objects[0]!;
    expect(stage.board).toMatchObject({width:17,height:15});
    expect([c.hp,c.def]).toEqual(difficulty==="easy"?[280,40]:difficulty==="normal"?[370,60]:[480,85]);
    expect(c).toMatchObject({id:"convoy",kind:"transport",routeIndex:0,cells:[cell("J13")],blocksMovement:true});
    expect(c.route).toEqual(["J13","J12","J11","J10","J9","J8","J7","J6","J5"].map(cell));
    expect(robotEarlyGoalCells(s.key)).toEqual([cell("J5")]);
    expect(getRobotBattleStructures(s)).toContainEqual(cell("J13"));
    expect(getRobotSortieSubobjective(12,earlyFormalProgress(s.key).party)).toBe(true);
    let progress=s;
    for(let round=1;round<=8;round++){
      progress={...progress,allied:{...progress.allied,round}};
      progress={...progress,objective:{kind:"early" as const,state:finishRobotEarlyRound(progress)}};
      expect(mission(progress).objects.objects[0]!.routeIndex).toBe(round);
      expect(mission(progress).objects.objects[0]!.hp).toBe(c.hp);
    }
    expect(mission(progress)).toMatchObject({result:"won",resultReason:"transport-arrived"});
  }
});
it("M12 exactly two blocked route rounds are allowed; three blocked rounds cause R10 loss",()=>{
  const original=scene(),blocker=move(original,"core-a","J12");
  const blocked1={...blocker,objective:{kind:"early" as const,state:finishRobotEarlyRound(blocker)}};
  expect(mission(blocked1).objects.objects[0]!.routeIndex).toBe(0);
  const blocked2={...blocked1,allied:{...blocked1.allied,round:2}};
  const two={...blocked2,objective:{kind:"early" as const,state:finishRobotEarlyRound(blocked2)}};
  expect(mission(two).objects.objects[0]!.routeIndex).toBe(0);
  let s=move(two,"core-a","G14");
  for(let round=3;round<=10;round++){
    s={...s,allied:{...s.allied,round}};
    s={...s,objective:{kind:"early" as const,state:finishRobotEarlyRound(s)}};
    expect(mission(s).objects.objects[0]!.routeIndex).toBe(round-2);
  }
  expect(mission(s).result).toBe("won");
  const third={...two,allied:{...two.allied,round:3}},three={...third,objective:{kind:"early" as const,state:finishRobotEarlyRound(third)}};
  let late=move(three,"core-a","G14");
  for(let round=4;round<=10;round++){
    late={...late,allied:{...late.allied,round}};
    late={...late,objective:{kind:"early" as const,state:finishRobotEarlyRound(late)}};
  }
  expect(mission(late)).toMatchObject({result:"lost",resultReason:"round-limit"});
  expect(mission(late).objects.objects[0]!.routeIndex).toBe(7);
});
it("M12 immediate convoy destruction loses, applies no regeneration, and cannot produce a bonus",()=>{
  for(const difficulty of ["easy","normal","hard"] as const){
    const s=scene(difficulty),c=mission(s).objects.objects[0]!;
    const attack={attackId:"lethal-convoy",sourceId:s.units.find(u=>u.kind==="light")!.id,hitCells:c.cells,damage:c.hp};
    const destroyed=reconcileRobotEarlyMission({...s,attackIds:[attack.attackId]},[attack]);
    expect(getRobotBattleResult(destroyed)).toMatchObject({result:"lost",reason:"transport-destroyed"});
    expect(getRobotSubobjectiveAchieved(destroyed)).toBe(false);
    expect(decodeRobotBattleCore(JSON.parse(JSON.stringify(destroyed)))).toEqual(destroyed);
    const partial=reconcileRobotEarlyMission({...s,attackIds:["scratch"]},[{...attack,attackId:"scratch",damage:20}]);
    const ended={...partial,objective:{kind:"early" as const,state:finishRobotEarlyRound(partial)}};
    expect(mission(ended).objects.objects[0]!.hp).toBe(c.hp-20);
    expect(mission(ended).objects.objects[0]!.routeIndex).toBe(1);
  }
});
it("M12 fixed R5 reinforcement is one-shot, has adjacent fallback, and defers as one intact squad",()=>{
  const s=scene(),wave=getRobotStagePlan(s.key).reinforcements[0]!;
  expect(wave).toMatchObject({id:"round5-crossfire",triggerType:"round-start",triggerRound:5});
  expect(wave.initialCells).toEqual(["N11","O11","P11"]);
  expect(wave.fallbackCells).toEqual(["N12","O12","P12"]);
  expect(spawnRobotEarlyWave(s,4,[]).spawned).toEqual([]);
  const first=spawnRobotEarlyWave(s,5,[]);
  expect(first.spawned).toEqual([{waveId:"round5-crossfire",squadId:"rear-shooters",cells:wave.initialCells.map(cell)}]);
  expect(spawnRobotEarlyWave({...s,objective:{kind:"early" as const,state:first.state}},6,[]).spawned).toEqual([]);
  const blockedPrimary=spawnRobotEarlyWave(s,5,wave.initialCells.map(cell));
  expect(blockedPrimary.spawned).toHaveLength(1);
  expect(blockedPrimary.spawned[0]!.cells).toEqual(wave.fallbackCells.map(cell));
  const blockedAll=spawnRobotEarlyWave(s,5,[...wave.initialCells,...wave.fallbackCells].map(cell));
  expect(blockedAll.spawned).toEqual([]);
  expect(blockedAll.deferredWaveIds).toEqual(["round5-crossfire"]);
  const delayed=spawnRobotEarlyWave({...s,objective:{kind:"early" as const,state:blockedAll.state}},6,[]);
  expect(delayed.spawned).toHaveLength(1);
});
it("M12 Easy defense frame and Normal/Hard ceil(60% maximum HP) are evaluated only after victory",()=>{
  const easy={missionNumber:12,difficulty:"easy" as const};
  const party=earlyFormalProgress(easy).party;
  expect(getRobotSortieSubobjective(12,party)).toBe(true);
  expect(getRobotSortieSubobjective(12,party.map(u=>({...u,frameId:"attack-1"})))).toBe(false);
  for(const [difficulty,maxHp,threshold] of [["normal",370,222],["hard",480,288]] as const){
    const key={missionNumber:12,difficulty};
    expect(evaluateRobotSubobjective(key,{result:"won",round:9,transport:{hp:threshold,maxHp}})).toBe(true);
    expect(evaluateRobotSubobjective(key,{result:"won",round:9,transport:{hp:threshold-1,maxHp}})).toBe(false);
    expect(evaluateRobotSubobjective(key,{result:"lost",round:9,transport:{hp:maxHp,maxHp}})).toBe(false);
  }
});
it("M12 corrupted transport path or false completed-round result is rejected on save",()=>{
  const s=scene(),m=mission(s);
  for(const bad of [
    {...m,objects:{...m.objects,objects:m.objects.objects.map(o=>({...o,routeIndex:8,cells:[cell("J5")]}))}},
    {...m,objects:{...m.objects,objects:m.objects.objects.map(o=>({...o,hp:o.maxHp+1}))}},
    {...m,spawnedWaveIds:["round5-crossfire"]},
    {...m,result:"won" as const,resultReason:"transport-arrived" as const},
    {...m,waveDueRound:2},
  ])expect(()=>decodeRobotBattleCore({...s,objective:{kind:"early",state:bad}})).toThrow();
  expect(robotFormalRuntime.readiness({missionNumber:13,difficulty:"easy"}).length).toBeGreaterThan(0);
});
it("M12 failed storage write, duplicate replay and retry preserve departure and reset convoy",async()=>{
  const key={missionNumber:12,difficulty:"easy" as const},progress=earlyFormalProgress(key),storage=new Storage();
  storage.raw=JSON.stringify({...createRobotOfflineSave(),progress});
  let index=0;const session=new RobotOfflineSession(storage,robotFormalRuntime,()=> "m12-atomic-"+(++index));
  await session.load();await session.start(key);
  const before=session.state,battle=before.battle!,action=earlyFormalAction(decodeRobotBattleCore(battle.snapshot));
  const input={battleId:battle.departure.battleId,expectedSequence:battle.sequence,actionId:"m12-action",action};
  storage.fail=true;await expect(session.act(input)).rejects.toThrow("disk-full");expect(session.state).toEqual(before);
  storage.fail=false;await session.act(input);const committed=session.state;
  await session.act(input);expect(session.state).toEqual(committed);
  await session.retry(true);
  expect(session.state.progress).toEqual(progress);
  expect(session.state.battle!.departure.party).toEqual(battle.departure.party);
  expect(session.state.battle!.departure.battleId).not.toEqual(battle.departure.battleId);
  const fresh=decodeRobotBattleCore(session.state.battle!.snapshot);
  expect(mission(fresh)).toMatchObject({waveDueRound:null,spawnedWaveIds:[],result:"ongoing",objects:{completedRound:0}});
  expect(mission(fresh).objects.objects[0]!.routeIndex).toBe(0);
});
