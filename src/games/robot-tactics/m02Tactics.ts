/** M02's adopted defensive intent, using the common legal damage evaluator.
 * No stat/reward/weapon changes or independent numerical tuning weights. */
import { checkRobotBossSkill, commitRobotBossSkill, type RobotBossSkillContext } from "./bossCommands";
import { getRobotBattleActor, getRobotBattleBoss, getRobotBattleMovementShape, getRobotBattleStructures, getRobotBattleUnit, robotBattleIsAlly, withRobotBattleBoss, type RobotBattleCoreState, type RobotBattleUnit } from "./battleState";
import { createRobotNormalDamageForecast } from "./battleWeaponActions";
import { getRobotLegalMoves, robotCellToPosition, type RobotPosition } from "./movement";
import { getRobotStagePlan } from "./stageCatalog";
import { resolveRobotBasicPart } from "./equipment";
export function getRobotM02BossContext(s: RobotBattleCoreState): RobotBossSkillContext {
  return {board:s.board,units:s.units.filter(u=>u.position&&u.hp>0).map(u=>({id:u.id,kind:u.kind,team:robotBattleIsAlly(u)?"player":"enemy",hp:u.hp,position:u.position!,squadId:u.squadId}))};
}
type Forecasts=ReadonlyMap<string,readonly ReturnType<typeof createRobotNormalDamageForecast>[]>;
function forecasts(s:RobotBattleCoreState):Forecasts{return new Map(s.units.filter(u=>u.hp>0).map(u=>[u.id,u.parts.filter(p=>resolveRobotBasicPart(p.partId,p.level).slot==="weapon").map(p=>createRobotNormalDamageForecast(u,p.partId))]));}
function strongestHit(s:RobotBattleCoreState,source:RobotBattleUnit,target:RobotBattleUnit,prepared:Forecasts){return Math.max(0,...(prepared.get(source.id)??[]).map(f=>f(s,target.id)??0));}
export function createRobotM02Forecast(s:RobotBattleCoreState){const prepared=forecasts(s);return {incoming:(state:RobotBattleCoreState,targetId:string)=>getRobotM02IncomingDamage(state,targetId,prepared),commandUtility:(state:RobotBattleCoreState)=>getRobotM02CommandUtility(state,prepared)};}

/** Current-cell ordinary threats only; no speculative new attack rules. */
export function getRobotM02IncomingDamage(s:RobotBattleCoreState,targetId:string,prepared:Forecasts=forecasts(s)):number{
 const target=getRobotBattleUnit(s,targetId);return s.units.filter(u=>u.hp>0&&robotBattleIsAlly(u)!==robotBattleIsAlly(target)).reduce((n,u)=>n+Math.min(target.hp,strongestHit(s,u,target,prepared)),0);
}
export function getRobotM02GuardAnchor(s:RobotBattleCoreState,unitId:string):RobotPosition|null{
 if(s.key.missionNumber!==2)return null;
 const unit=getRobotBattleUnit(s,unitId),stage=getRobotStagePlan(s.key);
 if(unit.id==="commander")return robotCellToPosition(stage.initialEnemies.find(u=>u.id===unit.id)!.cells[0]!);
 const squad=stage.initialEnemies.find(u=>u.id===unit.squadId);
 const ids=s.actors.find(a=>a.id===squad?.id)?.unitIds,index=ids?.indexOf(unit.id)??-1;
 return index>=0?robotCellToPosition(squad!.cells[index]!):null;
}
/** Compare the order's expected guard offense/defense gains in HP units with
 * normal attack utility. Forecasts are immutable; actual activation revalidates. */
export function getRobotM02CommandUtility(s:RobotBattleCoreState,prepared?:Forecasts):number|null{
 if(s.key.missionNumber!==2)return null;
 const actor=getRobotBattleActor(s),source=getRobotBattleUnit(s,actor.unitIds[0]!);
 if(actor.unitIds.length!==1||source.id!=="commander"||source.hp===0||!source.boss)return null;
 const boss=getRobotBattleBoss(source),context=getRobotM02BossContext(s);
 if(!checkRobotBossSkill(boss,context).available)return null;
 const ready=prepared??forecasts(s);
 const commanded={...s,units:s.units.map(u=>u.id===source.id?withRobotBattleBoss(u,commitRobotBossSkill(boss,context)):u)};
 const guards=s.units.filter(u=>u.hp>0&&u.kind==="light"&&u.squadId==="boss-escort"),targets=s.units.filter(u=>u.hp>0&&robotBattleIsAlly(u));
 let utility=0;
 for(const guard of guards){
  const shape=getRobotBattleMovementShape(guard),positions=[guard.position!,...(!shape||guard.rootedUntilOwnTurn!==undefined?[]:getRobotLegalMoves({...shape,board:s.board,origin:guard.position!,occupied:s.units.filter(u=>u.hp>0&&u.id!==guard.id).map(u=>u.position!),structures:getRobotBattleStructures(s)}).map(m=>m.destination))];
  const best=(state:RobotBattleCoreState)=>Math.max(0,...positions.flatMap(cell=>{const virtual={...state,units:state.units.map(u=>u.id===guard.id?{...u,position:cell}:u)};return targets.map(t=>Math.min(t.hp,strongestHit(virtual,getRobotBattleUnit(virtual,guard.id),getRobotBattleUnit(virtual,t.id),ready)));}));
  utility+=Math.max(0,best(commanded)-best(s));
  utility+=Math.max(0,getRobotM02IncomingDamage(s,guard.id,ready)-getRobotM02IncomingDamage(commanded,guard.id,ready));
 }
 return utility;
}
