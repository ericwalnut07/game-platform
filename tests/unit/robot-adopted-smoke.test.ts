import { expect, it } from "vitest";
import { checkRobotAttackRange } from "../../src/games/robot-tactics/attackRange";
import { checkRobotAttackSpatial, resolveRobotTargetDamage } from "../../src/games/robot-tactics/attackResolution";
import { calculateRobotBaseDamage, floorRobotDamageProduct, getRobotWeaponDamageEstimate } from "../../src/games/robot-tactics/combatMath";
import { beginRobotEnergyTurn, commitRobotEnergyAction, createRobotEnergyState, endRobotEnergyTurn, recordRobotEnergyCombatEvent } from "../../src/games/robot-tactics/energy";
import { getRobotStagePlan } from "../../src/games/robot-tactics/stageCatalog";
import { applyRobotObjectiveObjectBatch, createRobotObjectiveObjects } from "../../src/games/robot-tactics/objectiveObjects";
import { applyRobotSwordRecoil, getRobotNormalWeaponEnergyCost, getRobotWeaponComboPlan, resolveRobotTwoWeaponHits } from "../../src/games/robot-tactics/weaponActions";
import { applyRobotAlliedDefeats } from "../../src/games/robot-tactics/alliedLifecycle";
import { robotBattleLifecycle } from "../../src/games/robot-tactics/battleState";
import { coreFixture } from "../robot-tactics/coreFixture";

it("smokes adopted railgun EN -> Chebyshev/LOS -> post-base modifiers -> shared depot HP without double-cell damage", () => {
  const stage = getRobotStagePlan({ missionNumber:11, difficulty:"normal" }), initial = createRobotObjectiveObjects(stage), target = initial.objects[0]!;
  const weapon = { partId:"superheavy-railgun", level:5 }, origin = { x:target.cells[0]!.x+3, y:target.cells[0]!.y+3 };
  let energy = commitRobotEnergyAction(beginRobotEnergyTurn(createRobotEnergyState(200)), {kind:"normal-attack",energyCost:getRobotNormalWeaponEnergyCost(weapon)});
  const spatial = checkRobotAttackSpatial({kind:"normal",range:checkRobotAttackRange({origin,target:target.cells[0]!,min:3,max:5}),sight:{board:{width:19,height:17,walls:[]},origin,target:target.cells[0]!}});
  const estimate = getRobotWeaponDamageEstimate({weaponId:weapon.partId,weaponLevel:weapon.level,attackStats:{melee:40,ranged:160},targetDef:target.def,mode:"normal"});
  const hit = resolveRobotTargetDamage({attackLegal:true,spatial,effect:{kind:"damaging",resolveAfterModifiers:()=>floorRobotDamageProduct(estimate.baseDamage,[0.8,0.75])}});
  expect(hit.damage).toBe(45);
  const after = applyRobotObjectiveObjectBatch(initial,[{id:"shot",hits:[{objectId:target.id,cells:target.cells,damage:hit.damage}]}]);
  expect(after.objects.map(o=>o.hp)).toEqual([145,190]);
  energy = endRobotEnergyTurn(recordRobotEnergyCombatEvent(energy,"normal-hit")); expect(energy).toMatchObject({en:49,normalHitRecovered:false,action:{energyCost:20}});
  const restored = JSON.parse(JSON.stringify(after)) as typeof after;
  expect(applyRobotObjectiveObjectBatch(restored,[{id:"shot",hits:[{objectId:target.id,cells:target.cells,damage:hit.damage}]}])).toBe(restored);
});

it("smokes two-weapon hit order -> actual HP loss -> recoil -> common allied death/respawn queue without giving supporters costs", () => {
  const primary={partId:"double-edged-sword",level:1},secondary={partId:"light-lance",level:1};
  const plan=getRobotWeaponComboPlan(primary,secondary), clear={canReach:true,reason:"clear",sight:null} as const;
  const hits=resolveRobotTwoWeaponHits({primary,secondary,attackStat:100,targetDef:50,targetHp:100,spatial:[clear,clear]});
  expect(hits.hits.map(h=>h.actualHpDamage)).toEqual([37,12]);
  const recoil=applyRobotSwordRecoil(3,{attack:"weapon-combo",attackWeaponIds:[primary.partId,secondary.partId],actingAsSupporter:false,actualHpDamage:hits.hits.map(h=>h.actualHpDamage)});
  expect(recoil).toEqual({recoil:4,hp:0,defeated:true});
  const initialLife=robotBattleLifecycle(coreFixture());
  const life={...initialLife,allies:initialLife.allies.map(u=>u.id==="p1"?{...u,hp:3}:u)}, before=life.allies.find(u=>u.id==="f1")!;
  expect(recoil.defeated).toBe(true);
  const defeated=applyRobotAlliedDefeats(life,["p1"]);
  expect(defeated.state.waiting).toMatchObject([{unitId:"p1",returnRound:3}]); expect(defeated.state.allies.find(u=>u.id==="f1")).toEqual(before);
  const energy=commitRobotEnergyAction(beginRobotEnergyTurn(createRobotEnergyState(200)),{kind:"other",energyCost:plan.energyCost});
  expect(energy).toMatchObject({en:10,normalHitRecovered:false,action:{energyCost:50}});
});

it("smokes delta's range/LOS exemption with final damage, capped actual HP loss and initiator-only 10% recoil", () => {
  const spatial=checkRobotAttackSpatial({kind:"delta",range:{status:"unresolved",distance:null},sight:{board:{width:5,height:5,walls:[{x:1,y:1}]},origin:{x:0,y:0},target:{x:4,y:4}}});
  const base=calculateRobotBaseDamage({attackStat:180,weaponPower:85,targetDef:10,actionMultiplier:0.5,areaMultiplier:1});
  const damage=resolveRobotTargetDamage({attackLegal:true,spatial,effect:{kind:"damaging",resolveAfterModifiers:()=>base}}).damage;
  const actualHpDamage=[1,37,1000].map(hp=>Math.min(hp,damage)); expect(actualHpDamage).toEqual([1,37,132]);
  const input={attack:"delta" as const,attackWeaponIds:["double-edged-sword"],actingAsSupporter:false,actualHpDamage};
  expect(applyRobotSwordRecoil(100,input)).toEqual({hp:83,recoil:17,defeated:false});
  expect(applyRobotSwordRecoil(100,{...input,actingAsSupporter:true}).hp).toBe(100);
});
