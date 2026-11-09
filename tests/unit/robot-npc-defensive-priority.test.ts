import { describe, expect, it } from "vitest";
import { createRobotFormalBattleState } from "../../src/games/robot-tactics/stageDeployment";
import { createRobotOfflineProgress } from "../../src/games/robot-tactics/offlineProgress";
import { beginRobotBattleTurn, getRobotBattleFacilities, getRobotBattleUnit, type RobotBattleCoreState, type RobotBattleUnit } from "../../src/games/robot-tactics/battleState";
import { getRobotNpcAttackCandidates } from "../../src/games/robot-tactics/battleNpc";
import { getRobotNpcDefensiveTargetBonus, robotNpcHasActiveDefense, robotNpcScreensObjective, ROBOT_NPC_DEFENSIVE_TARGET_BONUS, ROBOT_NPC_FRONT_SCREEN_BONUS } from "../../src/games/robot-tactics/npcDefensivePriority";

function stage(missionNumber:number):RobotBattleCoreState{
  return createRobotFormalBattleState({battleId:"npc-tank-"+missionNumber,key:{missionNumber,difficulty:"easy"},party:createRobotOfflineProgress().party});
}
function unit(s:RobotBattleCoreState,enemy:boolean):RobotBattleUnit {
  return s.units.find(u=>u.hp>0&&(enemy?!["controlled","friendly-ai"].includes(u.kind):u.kind==="controlled"))!;
}
describe("defensive target priority",()=>{
  it("recognizes only active defend, shield, and protection (not pair defense)",()=>{
    const u=unit(stage(5),false);
    expect(robotNpcHasActiveDefense(u)).toBe(false);
    expect(robotNpcHasActiveDefense({...u,defended:true})).toBe(true);
    expect(robotNpcHasActiveDefense({...u,shielded:true})).toBe(true);
    const effect={kind:"protection" as const,ownerId:u.id,increase:10,cap:.5,expiresOwnTurn:2};
    expect(robotNpcHasActiveDefense({...u,formationDefense:[effect]})).toBe(true);
    expect(robotNpcHasActiveDefense({...u,formationDefense:[{...effect,kind:"pair-defense",cap:.6}]})).toBe(false);
  });
  it("screens the segment only between attacker and any occupied facility cell",()=>{
    const source={x:2,y:2},screen={x:4,y:4};
    expect(robotNpcScreensObjective(source,screen,[{x:6,y:6}])).toBe(true);
    expect(robotNpcScreensObjective(source,screen,[{x:6,y:8},{x:6,y:6}])).toBe(true);
    expect(robotNpcScreensObjective(source,screen,[{x:6,y:10}])).toBe(false);
    expect(robotNpcScreensObjective(source,{x:8,y:8},[{x:6,y:6}])).toBe(false);
    expect(robotNpcScreensObjective(source,{x:1,y:1},[{x:6,y:6}])).toBe(false);
    expect(robotNpcScreensObjective(source,{x:2,y:2},[{x:2,y:2}])).toBe(false);
  });
  for(const missionNumber of [5,12])it("M"+missionNumber+": tank screening the live convoy gets one basic and one front bonus",()=>{
    const s=stage(missionNumber),enemy=unit(s,true),defender=unit(s,false),convoy=getRobotBattleFacilities(s)[0]!;
    const cell=convoy.cells[0]!,source={x:cell.x-4,y:cell.y},front={x:cell.x-2,y:cell.y},side={x:cell.x-2,y:cell.y+3};
    const e={...enemy,position:source},t={...defender,position:front,defended:true};
    const scenario={...s,units:s.units.map(u=>u.id===enemy.id?e:u.id===defender.id?t:u)};
    expect(getRobotNpcDefensiveTargetBonus(scenario,e,t)).toBe(ROBOT_NPC_DEFENSIVE_TARGET_BONUS+ROBOT_NPC_FRONT_SCREEN_BONUS);
    expect(getRobotNpcDefensiveTargetBonus(scenario,e,{...t,position:side})).toBe(ROBOT_NPC_DEFENSIVE_TARGET_BONUS);
    expect(getRobotNpcDefensiveTargetBonus(scenario,e,{...t,defended:false})).toBe(0);
    expect(getRobotNpcDefensiveTargetBonus(scenario,e,{...t,shielded:true})).toBe(ROBOT_NPC_DEFENSIVE_TARGET_BONUS+ROBOT_NPC_FRONT_SCREEN_BONUS);
    expect(getRobotNpcDefensiveTargetBonus(scenario,e,{...t,shielded:true,formationDefense:[{kind:"protection",ownerId:t.id,increase:10,cap:.5,expiresOwnTurn:2}]})).toBe(ROBOT_NPC_DEFENSIVE_TARGET_BONUS+ROBOT_NPC_FRONT_SCREEN_BONUS);
    expect(getRobotNpcDefensiveTargetBonus(scenario,e,{...t,defended:false,shielded:false,formationDefense:[]})).toBe(0);
    const dead={...scenario,objective:{...s.objective,state:{...(s.objective.kind==="early"?s.objective.state:{}),objects:{...(s.objective.kind==="early"?s.objective.state.objects:{objects:[]}),objects:[{...convoy,hp:0}]}}}} as RobotBattleCoreState;
    expect(getRobotNpcDefensiveTargetBonus(dead,e,t)).toBe(ROBOT_NPC_DEFENSIVE_TARGET_BONUS);
  });

  for(const missionNumber of [5,12])it("M"+missionNumber+": actual enemy attack utility ranks B (screening) > C (defending) > A (plain) against the same convoy",()=>{
    const s=stage(missionNumber),enemy=unit(s,true),target=unit(s,false),convoy=getRobotBattleFacilities(s)[0]!;
    const cell=convoy.cells[0]!,origin={x:cell.x-3,y:cell.y},front={x:cell.x-1,y:cell.y},side={x:cell.x-1,y:cell.y-2};
    const opened=beginRobotBattleTurn(s,s.actors.find(a=>a.unitIds.includes(enemy.id))!.id);
    const scenario=(position:{x:number;y:number},defended:boolean)=>{
      const virtual={...opened,board:{...opened.board,walls:[]},units:opened.units.map(u=>u.id===enemy.id?{...u,position:origin,parts:[{partId:"assault-rifle",level:1}],energy:{...u.energy,en:100}}:u.id===target.id?{...u,position,defended}:u)};
      const candidates=getRobotNpcAttackCandidates(virtual,getRobotBattleUnit(virtual,enemy.id));
      const own=candidates.find(c=>c.packet.targets[0]?.entityId===target.id);
      const structure=candidates.find(c=>c.packet.targets[0]?.entityId===convoy.id);
      expect(own).toBeDefined();
      return {score:own!.score,structure:structure?.score??null,best:candidates[0]?.packet.targets[0]?.entityId};
    };
    const a=scenario(front,false),b=scenario(front,true),c=scenario(side,true);
    expect(b.score).toBeGreaterThan(c.score);
    expect(c.score).toBeGreaterThan(a.score);
    expect(b.best).toBe(target.id);
    if(b.structure!==null)expect(b.score).toBeGreaterThan(b.structure);
  });
  it("does not alter friendly AI target selection or enemy attacks against undefended units",()=>{
    const s=stage(5),friendly=unit(s,false),enemy=unit(s,true);
    expect(getRobotNpcDefensiveTargetBonus(s,friendly,enemy)).toBe(0);
    expect(getRobotNpcDefensiveTargetBonus(s,enemy,friendly)).toBe(0);
  });
  it("the real attack candidate utility prefers a defended reachable target without forcing illegal attacks",()=>{
    const s=stage(5),enemy=unit(s,true),allies=s.units.filter(u=>u.kind==="controlled");
    const origin={x:6,y:5},a={x:6,y:6},b={x:7,y:5};
    const opened=beginRobotBattleTurn(s,s.actors.find(a=>a.unitIds.includes(enemy.id))!.id);
    const moved={...opened,board:{...opened.board,walls:[]},units:opened.units.map(u=>u.id===enemy.id?{...u,position:origin,parts:[{partId:"assault-rifle",level:1}],energy:{...u.energy,en:100}}:u.id===allies[0]!.id?{...u,position:a,defended:true}:u.id===allies[1]!.id?{...u,position:b}:u)};
    const candidates=getRobotNpcAttackCandidates(moved,getRobotBattleUnit(moved,enemy.id));
    expect(candidates.some(c=>c.packet.targets[0]?.entityId===allies[0]!.id)).toBe(true);
    expect(candidates[0]?.packet.targets[0]?.entityId).toBe(allies[0]!.id);
  });
});
