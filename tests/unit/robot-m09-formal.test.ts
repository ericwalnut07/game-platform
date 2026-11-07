import { expect, it } from "vitest";
import { earlyFormalAction, earlyFormalProgress } from "../robot-tactics/earlyFormalController";
import { createRobotOfflineSave, RobotOfflineSession, type RobotOfflineStorage } from "../../src/games/robot-tactics/offlineSession";
import { robotFormalRuntime } from "../../src/games/robot-tactics/formalRuntime";
import { createRobotFormalBattleState } from "../../src/games/robot-tactics/stageDeployment";
import { decodeRobotBattleCore, beginRobotBattleTurn, commitRobotBattleBossCommand, getRobotBattleLegalMoves, getRobotBattleUnit, getRobotBattleResult, robotBattleTurnId } from "../../src/games/robot-tactics/battleState";
import { isRobotM09VoluntaryDestination } from "../../src/games/robot-tactics/bossCommands";
import { getRobotEnergyRecoveryAmounts } from "../../src/games/robot-tactics/energy";
import { getRobotM09NpcDisengage } from "../../src/games/robot-tactics/m09Tactics";
import { commitRobotNpcTurn } from "../../src/games/robot-tactics/battleNpc";
import { getRobotStagePlan } from "../../src/games/robot-tactics/stageCatalog";
import { robotCellToPosition as cell } from "../../src/games/robot-tactics/movement";
import { commitRobotFormation, getRobotFormationOptions } from "../../src/games/robot-tactics/formations";
import { getRobotSubobjectiveAchieved } from "../../src/games/robot-tactics/subobjectives";
import { finishRobotEarlyRound, reconcileRobotEarlyMission } from "../../src/games/robot-tactics/earlyMissions";
import { robotFormalBattleAdapter } from "../../src/client/games/robot-tactics/FormalBattleAdapter";
import { applyRobotOfflineOutcome } from "../../src/games/robot-tactics/offlineProgress";

class Storage implements RobotOfflineStorage {
  raw: string | null = null; fail = false;
  async read() { return this.raw; }
  async replace(expected: string | null, next: string) {
    if (this.fail) throw new Error("disk-full");
    if (this.raw !== expected) throw new Error("stale");
    this.raw = next;
  }
}
const scene = (difficulty: "easy"|"normal"|"hard" = "easy") => {
  const key={missionNumber:9,difficulty};
  return createRobotFormalBattleState({battleId:"m09-unit",key,party:earlyFormalProgress(key).party});
};

for (const difficulty of ["easy","normal","hard"] as const) {
  it(`M09 ${difficulty}: real boss, escort NPC, victory/reward, checkpoint and restart`,async()=>{
    const key={missionNumber:9,difficulty},stage=getRobotStagePlan(key),storage=new Storage(),progress=earlyFormalProgress(key);
    expect(stage.roundLimit).toBe(9);expect(stage.reinforcements).toEqual([]);expect(stage.blockingIssues).toEqual([]);
    storage.raw=JSON.stringify({...createRobotOfflineSave(),progress});
    const session=new RobotOfflineSession(storage,robotFormalRuntime,()=> "m09-"+difficulty);
    await session.load();await session.start(key);
    let saved=false,steps=0;
    for(;session.state.battle&&steps<260;steps++){
      const battle=session.state.battle,s=decodeRobotBattleCore(battle.snapshot),boss=getRobotBattleUnit(s,"moving-commander");
      expect(boss.boss?.plan.missionNumber).toBe(9);
      expect(()=>robotFormalBattleAdapter.project(battle)).not.toThrow();
      if(!saved && battle.sequence>=3){
        const restored=new RobotOfflineSession(storage,robotFormalRuntime,()=>"unused");await restored.load();
        expect(restored.state).toEqual(session.state);saved=true;
      }
      const action=earlyFormalAction(s);
      const predicted=robotFormalRuntime.act(battle.snapshot,action,battle.departure);
      await session.act({battleId:battle.departure.battleId,expectedSequence:battle.sequence,actionId:"m09-"+steps,action});
      if(predicted.outcome)expect(session.state.result?.subobjectiveAchieved).toBe(predicted.outcome.subobjectiveAchieved);
    }
    expect(steps).toBeLessThan(260);
    expect(saved).toBe(true);
    expect(session.state.battle).toBeNull();
    expect(session.state.result).toMatchObject({result:"won"});
    expect(session.state.result!.endedRound).toBeLessThanOrEqual(9);
    const earned=applyRobotOfflineOutcome(progress,key,session.state.result!);
    expect(session.state.progress).toEqual(earned.progress);
    expect(session.state.result!.expGained).toBe(earned.expGained);
    const restored=new RobotOfflineSession(storage,robotFormalRuntime,()=>"unused");await restored.load();
    expect(restored.state).toEqual(session.state);
  },30000);
}

it("M09 commander voluntary movement is confined to F2-L6; legal disengage costs EN30 and records its own turn",()=>{
  const initial=scene("easy"),{initiative:_initiative,...base}=initial;
  const near={...base,units:base.units.map(u=>u.id==="core-a"?{...u,position:cell("I7")}:u)};
  const s=beginRobotBattleTurn(near,"moving-commander");
  const boss=getRobotBattleUnit(s,"moving-commander");
  expect(getRobotBattleLegalMoves(s,boss.id)).not.toHaveLength(0);
  expect(getRobotBattleLegalMoves(s,boss.id).every(move=>isRobotM09VoluntaryDestination(move.destination))).toBe(true);
  const context=getRobotM09NpcDisengage(s);
  expect(context?.move).toBeDefined();
  const next=commitRobotBattleBossCommand(s,{actionId:"m09-escape",turnId:robotBattleTurnId(s),context:context!});
  const moved=getRobotBattleUnit(next,boss.id);
  expect(isRobotM09VoluntaryDestination(moved.position!)).toBe(true);
  expect(moved.position).not.toEqual(boss.position);
  expect(moved.energy.en).toBe(boss.energy.en-30+getRobotEnergyRecoveryAmounts(boss.energy.maxEn).actionEnd);
  expect(moved.boss!.lastSkillOwnTurn).toBe(1);
  expect(moved.energy.action?.kind).toBe("other");
  expect(decodeRobotBattleCore(next)).toEqual(next);
  const npc=commitRobotNpcTurn(s,{actionId:"npc-disengage",turnId:robotBattleTurnId(s)});
  expect(npc.latest?.summary).toContain("離脱機動");
  expect(getRobotBattleUnit(npc,"moving-commander").boss?.lastSkillOwnTurn).toBe(1);
});

it("M09 Normal/Hard award evidence is from real positive Line HP damage, persists on save, and never from a preview",()=>{
  for(const difficulty of ["normal","hard"] as const){
    const original=scene(difficulty),{initiative:_initiative,...rest}=original;
    const positions={ "core-a":"I10","core-b":"I11","moving-commander":"I9" } as const;
    const units=rest.units.map(u=>u.id in positions ? {...u,position:cell(positions[u.id as keyof typeof positions])}:u);
    const s=beginRobotBattleTurn({...rest,units},"core-a");
    const actor=getRobotBattleUnit(s,"core-a");
    const available=actor.parts.flatMap(p=>{
      try {const o=getRobotFormationOptions(s,"line",p.partId);return o.selections.filter(x=>x.targetIds.includes("moving-commander")).map(x=>({weaponId:p.partId,...x}));}
      catch{return [];}
    });
    expect(available.length).toBeGreaterThan(0);
    const a=available[0]!;
    const next=commitRobotFormation(s,{kind:"line",weaponId:a.weaponId,participantIds:a.participantIds,targetIds:a.targetIds,actionId:"line-valid",turnId:robotBattleTurnId(s)});
    if(next.objective.kind!=="early")throw new Error("Missing M09 objective");
    const hit=next.objective.state.m09FormationHit;
    expect(hit).toMatchObject({technique:"line",sourceId:"core-a",targetId:"moving-commander",attackId:"line-valid:formation"});
    expect(decodeRobotBattleCore(JSON.parse(JSON.stringify(next)))).toEqual(next);
    const finished=getRobotBattleResult(next).result==="won"?next:reconcileRobotEarlyMission({...next,units:next.units.map(u=>u.id==="moving-commander"?{...u,hp:0}:u)});
    expect(getRobotSubobjectiveAchieved(finished)).toBe(true);
    const tampered={...next,objective:{kind:"early" as const,state:{...next.objective.state,m09FormationHit:{...hit!,attackId:"forged:formation"}}}};
    expect(()=>decodeRobotBattleCore(tampered)).toThrow("receipt");
  }
});

it("M09 round-nine loss cannot be mistaken for a boss defeat, and M13 remains inaccessible",()=>{
  const s=scene();
  if(s.objective.kind!=="early")throw Error("early");
  const pending={...s,allied:{...s.allied,round:9},objective:{kind:"early" as const,state:{...s.objective.state,objects:{...s.objective.state.objects,completedRound:8}}}};
  expect(finishRobotEarlyRound(pending)).toMatchObject({result:"lost",resultReason:"round-limit"});
  expect(robotFormalRuntime.readiness({missionNumber:13,difficulty:"easy"}).length).toBeGreaterThan(0);
});

it("M09 failed write, duplicate replay and retry preserve one departure loadout",async()=>{
  const key={missionNumber:9,difficulty:"easy" as const},storage=new Storage(),progress=earlyFormalProgress(key);
  storage.raw=JSON.stringify({...createRobotOfflineSave(),progress});
  let counter=0;const session=new RobotOfflineSession(storage,robotFormalRuntime,()=> "m09-retry-"+(++counter));
  await session.load();await session.start(key);
  const before=session.state,battle=before.battle!,action=earlyFormalAction(decodeRobotBattleCore(battle.snapshot));
  const input={battleId:battle.departure.battleId,expectedSequence:battle.sequence,actionId:"m09-atomic",action};
  storage.fail=true;await expect(session.act(input)).rejects.toThrow("disk-full");expect(session.state).toEqual(before);
  storage.fail=false;await session.act(input);const committed=session.state;
  await session.act(input);expect(session.state).toEqual(committed);
  await session.retry(true);expect(session.state.progress).toEqual(progress);
  expect(session.state.battle!.departure.party).toEqual(battle.departure.party);
  expect(session.state.battle!.departure.battleId).not.toBe(battle.departure.battleId);
});
