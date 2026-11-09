import { expect, it } from "vitest";
import { createRobotFormalBattleState } from "../../src/games/robot-tactics/stageDeployment";
import { createRobotOfflineProgress } from "../../src/games/robot-tactics/offlineProgress";
import { beginRobotBattleTurn, decodeRobotBattleCore, getRobotBattleFacilities, getRobotBattleUnit, robotBattleTurnId, type RobotBattleCoreState } from "../../src/games/robot-tactics/battleState";
import { getRobotSpecialFacilityTargets, getRobotSpecialFacilityPacket } from "../../src/games/robot-tactics/specialFacilityTargets";
import { getRobotActiveCombatOptions, commitRobotActiveCombat } from "../../src/games/robot-tactics/activeCombat";
import { getRobotAdoptedActionOptions, commitRobotAdoptedAction } from "../../src/games/robot-tactics/adoptedEffects";
import { robotFormalBattleAdapter } from "../../src/client/games/robot-tactics/FormalBattleAdapter";
import { robotCellToPosition as cell } from "../../src/games/robot-tactics/movement";

function scene(): RobotBattleCoreState {
  const deployed=createRobotFormalBattleState({battleId:"special-facility",key:{missionNumber:4,difficulty:"easy"},party:createRobotOfflineProgress().party});
  const {initiative:_initiative,...core}=deployed;
  return decodeRobotBattleCore(core);
}
function prepared(weaponId:string,addons:string[]=[],at="D6",moved=false) {
  const s=scene();
  return beginRobotBattleTurn({...s,units:s.units.map(u=>u.id==="core-a"?{
    ...u,position:cell(at),parts:[{partId:weaponId,level:1},{partId:weaponId==="light-lance"?"light-pistol":"light-lance",level:1}],
    addons:addons.map(partId=>({partId})),energy:{...u.energy,en:u.energy.maxEn,moved}
  }:u)},"core-a");
}
const identity=(s:RobotBattleCoreState)=>({actionId:"facility-special",turnId:robotBattleTurnId(s)});
function chargeScene() {
  const original=scene(), depot=getRobotBattleFacilities(original).find(f=>f.id==="depot-left")!;
  for(let y=0;y<original.board.height;y++)for(let x=0;x<original.board.width;x++){
    const position={x,y};
    if(!depot.cells.some(c=>Math.max(Math.abs(c.x-x),Math.abs(c.y-y))===2))continue;
    if(original.board.walls.some(c=>c.x===x&&c.y===y)||getRobotBattleFacilities(original).some(f=>f.cells.some(c=>c.x===x&&c.y===y))||original.units.some(u=>u.id!=="core-a"&&u.hp>0&&u.position?.x===x&&u.position.y===y))continue;
    try{
      const s=prepared("light-lance",[],String.fromCharCode(65+x)+(y+1),true);
      if(getRobotActiveCombatOptions(s,"charge-strike","light-lance").targetIds.includes("depot-left"))return s;
    }catch{/* non-legal deployment candidate */}
  }
  throw new Error("No legal charge starting tile found");
}

it("uses hostile facility footprint and never accepts an ally or a blocked/out-of-range tile",()=>{
  const s=prepared("howitzer");
  const choices=getRobotSpecialFacilityTargets(s,"core-a","howitzer",{min:1,max:6});
  expect(choices.filter(x=>x.objectId==="depot-left")).toHaveLength(2);
  expect(choices.some(x=>x.objectId==="depot-right")).toBe(false); // outside the selected weapon range
  expect(()=>getRobotSpecialFacilityPacket(s,"core-a","howitzer","depot-left",cell("A1"),"bad",{min:1,max:6},.7)).toThrow("Illegal");
  const packet=getRobotSpecialFacilityPacket(s,"core-a","howitzer","depot-left",cell("D3"),"hit",{min:1,max:6},.7);
  expect(packet.targets).toHaveLength(1);
  expect(packet.targets[0]!.entityId).toBe("depot-left");
  expect(packet.targets[0]!.resolution.damage).toBeGreaterThan(0);
});
it("tactical marking special damages the depot without creating a robot-only mark",()=>{
  const s=prepared("howitzer",["tactical-marking-attack"]);
  const o=getRobotAdoptedActionOptions(s,"tactical-marking-attack","howitzer");
  expect(o.targetIds).toContain("depot-left");
  const old=getRobotBattleFacilities(s).find(f=>f.id==="depot-left")!.hp;
  const n=commitRobotAdoptedAction(s,{...identity(s),kind:"tactical-marking-attack",weaponId:"howitzer",targetId:"depot-left"});
  expect(getRobotBattleFacilities(n).find(f=>f.id==="depot-left")!.hp).toBeLessThan(old);
  expect(n.latest!.damage.map(e=>e.targetId)).toEqual(["depot-left"]);
  expect(n.units.every(u=>!u.tacticalMark)).toBe(true);
});
it("ordinary charge targets the depot footprint and advances to a free adjacent tile",()=>{
  const s=chargeScene();
  const o=getRobotActiveCombatOptions(s,"charge-strike","light-lance");
  expect(o.targetIds).toContain("depot-left");
  const before=getRobotBattleFacilities(s).find(f=>f.id==="depot-left")!.hp;
  const n=commitRobotActiveCombat(s,{...identity(s),kind:"charge-strike",weaponId:"light-lance",targetIds:["depot-left"]});
  expect(getRobotBattleFacilities(n).find(f=>f.id==="depot-left")!.hp).toBeLessThan(before);
  expect(getRobotBattleFacilities(n).find(f=>f.id==="depot-left")!.cells.some(c=>Math.max(Math.abs(c.x-getRobotBattleUnit(n,"core-a").position!.x),Math.abs(c.y-getRobotBattleUnit(n,"core-a").position!.y))===1)).toBe(true);
  expect(n.latest!.damage.some(e=>e.targetId==="depot-left")).toBe(true);
});
it("facility targets are offered by the production command adapter",()=>{
  const s=prepared("light-lance",[],"D5",true);
  const snapshot=JSON.stringify(s);
  const adapter=robotFormalBattleAdapter.project({departure:{battleId:s.id} as never,snapshot,sequence:1} as never);
  expect(adapter.choices.some(c=>c.commandId==="charge-strike:light-lance"&&c.selection.targetIds.includes("depot-left"))).toBe(true);
});
