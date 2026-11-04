/** Only earned loadout input and legal player decisions; real M01/AI remain unchanged. */
import { offlineAddonFixtureProgress } from "./offlineAddonFixture";
import { applyRobotCustomization } from "../../src/games/robot-tactics/customization";
import { getRobotRemainingStrikeOptions,type RobotRemainingStrike } from "../../src/games/robot-tactics/remainingCombat";
import { getRobotBattleNormalAttackOptions } from "../../src/games/robot-tactics/battleWeaponActions";
import { getRobotBattleActor,getRobotBattleLegalMoves,getRobotBattleUnit,type RobotBattleCoreState } from "../../src/games/robot-tactics/battleState";
import type { RobotJson } from "../../src/games/robot-tactics/offlineSession";
export type RemainingFormalCase=RobotRemainingStrike|"extreme-lance-extension"|"shared-victory-recovery-circuit";
export const remainingCaseWeapon=(kind:RemainingFormalCase)=>kind==="sniper-penetration"?"precision-rifle":kind==="anti-materiel-focus"?"superheavy-railgun":kind==="thrust-linear-pierce"||kind==="extreme-lance-extension"?"armor-pile":kind==="crush-immobilizer"?"binding-hammer":kind==="function-lock-round"||kind==="debuff-transfer-round"?"corrosion-rifle":"heavy-missile-cannon";
export function remainingFormalProgress(kind:RemainingFormalCase){
 let p=applyRobotCustomization(offlineAddonFixtureProgress(),{kind:"part-equip",coreId:"core-c",slot:"weapon2",partId:remainingCaseWeapon(kind)});
 const ids:readonly string[]=kind==="thrust-linear-pierce"?[kind,"extreme-lance-extension","extend-lance"]:kind==="extreme-lance-extension"?[kind,"extend-lance"]:[kind];
 for(const partId of ids)p=applyRobotCustomization(p,{kind:"addon-equip",coreId:"core-c",partId});return p;
}
export function remainingFormalAction(s:RobotBattleCoreState,kind:RemainingFormalCase):RobotJson{
 const unit=getRobotBattleUnit(s,getRobotBattleActor(s).unitIds[0]!);if(unit.kind!=="controlled")return{kind:"npc"};if(unit.id!=="core-c")return{kind:"charge"};
 const weaponId=remainingCaseWeapon(kind),normal=kind==="extreme-lance-extension"||kind==="shared-victory-recovery-circuit";
 const select=(state:RobotBattleCoreState)=>normal?getRobotBattleNormalAttackOptions(state,weaponId).targetIds.map(id=>[id]):getRobotRemainingStrikeOptions(state,kind,weaponId).targetSets;
 const sets=select(s);if(sets.length)return normal?{kind:"normal",weaponId,targetId:sets[0]![0]!}:{kind,weaponId,targetIds:sets[0]!};
 if(!unit.energy.moved){
  const moves=getRobotBattleLegalMoves(s,unit.id), candidate=moves.find(m=>select({...s,units:s.units.map(u=>u.id===unit.id?{...u,position:m.destination,energy:{...u.energy,moved:true}}:u)}).length);
  if(candidate)return{kind:"move",destination:{...candidate.destination}};
  const enemies=s.units.filter(u=>u.kind!=="controlled"&&u.kind!=="friendly-ai"&&u.hp>0&&u.position),dist=(p:{x:number;y:number})=>Math.min(...enemies.map(u=>Math.max(Math.abs(p.x-u.position!.x),Math.abs(p.y-u.position!.y))));
  const closest=[...moves].sort((a,b)=>dist(a.destination)-dist(b.destination))[0];if(closest&&dist(closest.destination)<dist(unit.position!))return{kind:"move",destination:{...closest.destination}};
 }
 return{kind:"charge"};
}
