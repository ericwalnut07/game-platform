import { expect, it } from "vitest";
import { getRobotPlaytestReinforcement, chooseRobotPlaytestReinforcement } from "../../src/games/robot-tactics/playtestReinforcements";
import { getRobotStagePlan } from "../../src/games/robot-tactics/stageCatalog";
import { createRobotFormalBattleState, createRobotStageEnemyUnits } from "../../src/games/robot-tactics/stageDeployment";
import { createRobotOfflineProgress } from "../../src/games/robot-tactics/offlineProgress";
import { decodeRobotBattleCore, commitRobotBattlePassive, getRobotBattleRoundLimit, getRobotBattleResult, robotBattleTurnId, type RobotBattleCoreState } from "../../src/games/robot-tactics/battleState";
import { robotFormalRuntime, scheduleRobotFormalBattle, robotBattleJson } from "../../src/games/robot-tactics/formalRuntime";
import { applyRobotDisplacement } from "../../src/games/robot-tactics/displacement";
import { weaponCoreFixture } from "../robot-tactics/weaponCoreFixture";
import { getRobotNormalActionCost, getRobotUnitNormalFinisherFactor } from "../../src/games/robot-tactics/combatAddons";
import { getRobotM30EliminationPlan } from "../../src/games/robot-tactics/m30Elimination";
import { getRobotExpansionStagePlan } from "../../src/games/robot-tactics/expansionStageCatalog";
import catalog from "../../docs/design/robot-tactics/addons.json";
const party = createRobotOfflineProgress().party;
const departure = (m:number, difficulty:"easy"|"normal"|"hard") => ({ battleId:`balance-${m}-${difficulty}`, key:{missionNumber:m,difficulty}, party });

it("keeps exact adopted counts, archetypes, normal enemy generation and unchanged initial rosters",()=>{
  const expectedNormal=[4,6,8,10,11,13,14,15,17,18,20,21,23,25,27,28,29];
  for(const difficulty of ["easy","normal","hard"] as const) {
    const added:number[]=[];
    for(let m=1;m<=29;m++) {
      const stage=getRobotStagePlan({missionNumber:m,difficulty}), extra=getRobotPlaytestReinforcement(stage);
      if(!extra) continue;
      added.push(m);
      const unit=createRobotStageEnemyUnits(stage,extra.unit,[{x:0,y:0}])[0]!;
      expect(unit.kind).toBe(difficulty==="hard"&&[15,18,20,21,23,25,27,28,29].includes(m)?"heavy":"medium");
      expect(extra.unit.enemyCoreLevel).toBe(stage.referenceEnemyCoreLevel);
      expect(unit.parts.every(p=>p.level===stage.enemyWeaponLevel)).toBe(true);
    }
    expect(added).toEqual(difficulty==="easy"?[]:difficulty==="normal"?expectedNormal:Array.from({length:28},(_,i)=>i+2));
  }
});
it.each(Array.from({length:28},(_,i)=>i+2))("M%s chooses a legal nearby pad after the original wave, defers and retries",m=>{
  const stage=getRobotStagePlan({missionNumber:m,difficulty:"hard"});
  let state=createRobotFormalBattleState(departure(m,"hard"));
  const extra=getRobotPlaytestReinforcement(stage)!;
  if(state.objective.kind==="early" && extra.round===null) state={...state,objective:{...state.objective,state:{...state.objective.state,spawnedWaveIds:stage.reinforcements.map(w=>w.id)}}};
  const occupied=state.units.flatMap(u=>u.position?[u.position]:[]);
  const cell=chooseRobotPlaytestReinforcement(state,stage,extra.round??10,occupied,[]);
  expect(cell).not.toBeNull();
  expect(occupied).not.toContainEqual(cell);
  expect(state.board.walls).not.toContainEqual(cell);
  if(extra.round) expect(chooseRobotPlaytestReinforcement(state,stage,extra.round-1,occupied,[])).toBeNull();
  const full=Array.from({length:stage.board.width*stage.board.height},(_,i)=>({x:i%stage.board.width,y:Math.floor(i/stage.board.width)}));
  expect(chooseRobotPlaytestReinforcement(state,stage,20,full,[])).toBeNull();
  expect(chooseRobotPlaytestReinforcement({...state,playtestReinforcementSpawned:true},stage,20,occupied,[])).toBeNull();
  expect(chooseRobotPlaytestReinforcement({...state,expansionDifficulty:"hardest"},stage,20,occupied,[])).toBeNull();
});
it.each([2,9,15])("M%s persists one additional enemy across real round scheduling and reload",m=>{
  const d=departure(m,"hard");let s=decodeRobotBattleCore(robotFormalRuntime.create(d));
  while(s.allied.round<7 && getRobotBattleResult(s).result==="ongoing") {
    s=scheduleRobotFormalBattle(commitRobotBattlePassive(s,{kind:"wait",actionId:`wait:${s.turn.serial}`,turnId:robotBattleTurnId(s)}));
    robotFormalRuntime.validate(robotBattleJson(s),d);
  }
  expect(s.units.filter(u=>u.id.startsWith("playtest-m"))).toHaveLength(1);
  expect(decodeRobotBattleCore(robotBattleJson(s)).playtestReinforcementSpawned).toBe(true);
});
it("uses new CAP, active multipliers and free indirect control",()=>{
  const part=(id:string)=>catalog.parts.find(p=>p.id===id)!;
  expect(part("overload-propulsion").cap).toBe(16);
  expect(part("lance-pull-strike").effect).toMatchObject({damageMultiplier:1,energyCost:10});
  expect(part("burning-round").effect).toMatchObject({impactDamageFractionOfNormalAttack:.7,energyCost:15});
  expect(getRobotNormalActionCost({partId:"light-pistol",level:1},[{partId:"indirect-fire-control"}])).toBe(0);
  expect([49,50,51].map(hp=>getRobotUnitNormalFinisherFactor(hp,100,[{partId:"weakness-finisher"}],true))).toEqual([1.25,1.25,1]);
});
it.each([false,true])("all pushes apply separate DEF-ignoring reduced collision damage (breaker %s)",breaker=>{
  const fixture=weaponCoreFixture({targetIds:["enemy-supreme-commander"],offsets:[{x:1,y:0}]});
  const source=fixture.units.find(u=>u.id==="p1")!, victim=fixture.units.find(u=>u.id==="enemy-supreme-commander")!;
  const s:RobotBattleCoreState={...fixture,board:{...fixture.board,walls:[{x:source.position!.x+2,y:source.position!.y}]},units:fixture.units.map(u=>u.id===source.id?{...u,addons:breaker?[{partId:"wall-collision-breaker"}]:[]}:u.id===victim.id?{...u,stats:{...u.stats,def:9999},defended:true}:u)};
  const push=(extra={})=>applyRobotDisplacement(s,{sourceId:source.id,targetId:victim.id,distance:1,...extra},"balance");
  expect(push().events.map(e=>e.damage)).toEqual([breaker?16:8]);
  expect(push({normalBlunt:true}).events.map(e=>e.damage)).toEqual([breaker?16:8]);
  expect(push({collisionDamage:40}).events.map(e=>e.damage)).toEqual([32]);
  expect(push({pull:true}).events).toHaveLength(0);
});
it.each(["easy","normal","hard"] as const)("M30 %s and expansion phase one use 20R",difficulty=>{
  expect(getRobotM30EliminationPlan({missionNumber:30,difficulty}).roundLimit).toBe(20);
  const s=decodeRobotBattleCore(robotFormalRuntime.create(departure(30,difficulty)));
  expect(getRobotBattleRoundLimit(s)).toBe(20);
  expect(getRobotExpansionStagePlan({missionNumber:30,difficulty:"hardest"}).roundLimit).toBe(20);
});

it("retains the original expansion rosters, with no playtest units",()=>{
  for(const difficulty of ["hardest","inferno"] as const) for(let m=1;m<=29;m++) {
    const plan=getRobotExpansionStagePlan({missionNumber:m,difficulty});
    expect([...plan.initialEnemies,...plan.reinforcements.flatMap(w=>w.members)].some(u=>u.id.startsWith("playtest-"))).toBe(false);
  }
});
