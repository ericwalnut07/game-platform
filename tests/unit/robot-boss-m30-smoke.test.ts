import { expect, it } from "vitest";
import { beginRobotBossTurn, commitRobotBossSkill, createRobotBossState, getRobotCommandBonuses, type RobotBossSkillContext } from "../../src/games/robot-tactics/bossCommands";
import { applyRobotM30BossHit, applyRobotM30FacilityAttack, commitRobotM30DataAction, createRobotM30State, finishRobotM30Round, spawnRobotM30Reinforcements } from "../../src/games/robot-tactics/m30Mission";
import { getRobotWeaponDamageEstimate } from "../../src/games/robot-tactics/combatMath";
import { checkRobotAttackSpatial, resolveRobotTargetDamage } from "../../src/games/robot-tactics/attackResolution";
import { beginRobotEnergyTurn, createRobotEnergyState, endRobotEnergyTurn } from "../../src/games/robot-tactics/energy";
import { getRobotStagePlan } from "../../src/games/robot-tactics/stageCatalog";
import { robotCellToPosition } from "../../src/games/robot-tactics/movement";
import type { RobotAlliedLifeUnit } from "../../src/games/robot-tactics/alliedLifecycle";

it("smokes final M30 command -> common damage -> shared facility -> boss death -> data -> both waves -> R16 AND",()=>{
  let mission=createRobotM30State("hard");
  let boss=beginRobotBossTurn({...createRobotBossState(30,"hard",robotCellToPosition("J10")),hp:275});
  const ctx:RobotBossSkillContext={board:{width:19,height:17,walls:[]},units:[{id:"s1",kind:"light",team:"enemy",squadId:"distant-fireline",chassis:"ranged",hp:88,position:robotCellToPosition("P8")}]};
  boss=commitRobotBossSkill(boss,ctx);expect(getRobotCommandBonuses(boss.effects,ctx.units[0]!,"allied-final-relay")).toEqual({melee:22,ranged:22,defense:16});
  // A later legal boss attack is evaluated using the shared weapon/LOS pipeline.
  // This is a deterministic component fixture, not a complete initiative/AI simulation.
  const weapon=boss.plan.weapons[1]!;
  const base=getRobotWeaponDamageEstimate({weaponId:weapon.id,weaponLevel:weapon.level,attackStats:{melee:boss.plan.stats.melee,ranged:boss.plan.stats.ranged},targetDef:mission.facility.def,mode:"burst-center"});
  const spatial=checkRobotAttackSpatial({kind:"normal",range:{status:"in-range",distance:3},sight:{board:ctx.board,origin:boss.position,target:mission.facility.cells[0]!}});
  const hit=resolveRobotTargetDamage({attackLegal:true,spatial,effect:{kind:"damaging",resolveAfterModifiers:()=>base.baseDamage}});
  mission=applyRobotM30FacilityAttack(mission,{attackId:"boss-blast",hitCells:mission.facility.cells,damage:hit.damage});
  expect(mission.facility.hp).toBe(660-hit.damage);expect(hit.damage).toBeGreaterThanOrEqual(1);
  const killed=applyRobotM30BossHit(mission,boss,275);mission=killed.state;boss=killed.boss;
  expect(boss.effects).toEqual([]);expect(mission.bossDefeated).toBe(true);expect(mission.result).toBe("ongoing");
  const actor:RobotAlliedLifeUnit={id:"p1",kind:"controlled",number:1,hp:100,maxHp:100,en:30,maxEn:100,position:robotCellToPosition("K3"),statuses:[],carriedObjectiveId:null};
  const pickup=commitRobotM30DataAction(mission,actor,beginRobotEnergyTurn(createRobotEnergyState(100)),"pickup");
  const nextEnergy=beginRobotEnergyTurn(endRobotEnergyTurn(pickup.energy));
  mission=commitRobotM30DataAction(pickup.state,{...pickup.actor,en:nextEnergy.en,position:robotCellToPosition("I14")},nextEnergy,"transmit").state;
  const waves:string[]=[];
  while(mission.round<16){mission=finishRobotM30Round(mission,mission.round);const spawned=spawnRobotM30Reinforcements(mission,[]);mission=spawned.state;waves.push(...spawned.spawned.map(w=>`${mission.round}:${w.aiRole}`));expect(mission.result).toBe("ongoing");}
  expect(waves).toEqual(["7:west-assault","12:east-raider"]);
  expect(finishRobotM30Round(mission,16).result).toBe("won");
  expect(getRobotStagePlan({missionNumber:22,difficulty:"hard"}).blockingIssues).toContain("Composite victory condition not adopted");
});
