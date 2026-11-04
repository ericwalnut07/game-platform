import { getRobotAddonCost } from "./combatAddons";
import { commitRobotEnergyAction, getRobotActionEnergyBlock } from "./energy";
import { floorRobotDamageProduct } from "./combatMath";
import { applyRobotPhaseDamage, getRobotDamageFactors, hasRobotAddon } from "./battleEffects";
import { resolveRobotFuses } from "./fuseResolution";
import { finishRobotBattleTurn, getRobotBattleActor, getRobotBattleStructures, getRobotBattleFacilities, getRobotBattleUnit, recordRobotBattleAction, requireRobotBattleInput, robotBattleIsAlly, sameRobotCoreCell, type RobotBattleCoreState, type RobotBattleDamageEvent, type RobotBattleUnit } from "./battleState";
import { getRobotStagePlan } from "./stageCatalog";
import type { RobotPosition } from "./movement";
export type RobotHazardKind = "proximity-mine" | "movement-interference-field" | "persistent-blast-fire";
export interface RobotHazard { readonly id: string; readonly kind: RobotHazardKind; readonly ownerId: string; readonly cell: RobotPosition; readonly placedRound: number; readonly expiresRound: number }
export interface RobotHazardState { readonly zones: readonly RobotHazard[]; readonly fireHits: readonly { readonly targetId: string; readonly turnSerial: number }[] }
const distance=(a:RobotPosition,b:RobotPosition)=>Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y));
function terrainPassable(s:RobotBattleCoreState,c:RobotPosition){return Number.isSafeInteger(c.x)&&Number.isSafeInteger(c.y)&&c.x>=0&&c.y>=0&&c.x<s.board.width&&c.y<s.board.height&&!s.board.walls.some(p=>sameRobotCoreCell(p,c))&&!getRobotBattleFacilities(s).some(f=>f.cells.some(p=>sameRobotCoreCell(p,c)));}
export function getRobotHazardCells(s:RobotBattleCoreState,z:RobotHazard):RobotPosition[]{const r=z.kind==="movement-interference-field"?2:1;return Array.from({length:(2*r+1)**2},(_,i)=>({x:z.cell.x+i%(2*r+1)-r,y:z.cell.y+Math.floor(i/(2*r+1))-r})).filter(c=>c.x>=0&&c.y>=0&&c.x<s.board.width&&c.y<s.board.height&&(z.kind!=="persistent-blast-fire"||terrainPassable(s,c)));}
export function getRobotHazardMovePenalty(s:RobotBattleCoreState,u:RobotBattleUnit){return !robotBattleIsAlly(u)&&u.hp>0&&u.position&&s.hazards?.zones.some(z=>z.kind==="movement-interference-field"&&distance(z.cell,u.position!)<=2)?1:0;}
export function getRobotHazardPlacementOptions(s:RobotBattleCoreState,kind:Exclude<RobotHazardKind,"persistent-blast-fire">){
 const actor=getRobotBattleActor(s),u=getRobotBattleUnit(s,actor.unitIds[0]!),energyCost=getRobotAddonCost(kind),cells:RobotPosition[]=[];
 let disabledReason=actor.unitIds.length!==1||u.kind!=="controlled"||u.hp<=0||!u.position||u.energy.action||!hasRobotAddon(u,kind)?"対応パーツと未行動の操作機が必要です":getRobotActionEnergyBlock(u.energy,energyCost);
 if(!disabledReason)for(let y=0;y<s.board.height;y++)for(let x=0;x<s.board.width;x++){const c={x,y};if(distance(u.position!,c)>(kind==="proximity-mine"?2:3)||!terrainPassable(s,c)||getRobotBattleStructures(s).some(p=>sameRobotCoreCell(p,c))||s.units.some(v=>v.hp>0&&v.position&&sameRobotCoreCell(v.position,c))||kind==="proximity-mine"&&s.hazards?.zones.some(z=>z.kind==="proximity-mine"&&distance(z.cell,c)<=1))continue;cells.push(c);}
 disabledReason??=cells.length?null:"合法な空きマスがありません";return{energyCost,cells,disabledReason};
}
export function addRobotHazard(s:RobotBattleCoreState,kind:RobotHazardKind,ownerId:string,cell:RobotPosition,id:string):RobotBattleCoreState{
 const zone:RobotHazard={id,kind,ownerId,cell:{...cell},placedRound:s.allied.round,expiresRound:s.allied.round+1};return{...s,hazards:{zones:[...(s.hazards?.zones??[]),zone],fireHits:s.hazards?.fireHits??[]}};
}
export function commitRobotHazardPlacement(s:RobotBattleCoreState,input:{readonly actionId:string;readonly turnId:string;readonly kind:Exclude<RobotHazardKind,"persistent-blast-fire">;readonly cell:RobotPosition}){
 if(!requireRobotBattleInput(s,input.actionId,input.turnId))return s;
 const options=getRobotHazardPlacementOptions(s,input.kind);if(options.disabledReason||!options.cells.some(c=>sameRobotCoreCell(c,input.cell)))throw new Error(options.disabledReason??"Legal empty hazard cell required");
 const u=getRobotBattleUnit(s,getRobotBattleActor(s).unitIds[0]!);let next=addRobotHazard(s,input.kind,u.id,input.cell,input.actionId+":zone");next={...next,units:next.units.map(v=>v.id===u.id?{...v,energy:commitRobotEnergyAction(v.energy,{kind:"other",energyCost:options.energyCost})}:v)};
 return recordRobotBattleAction(finishRobotBattleTurn(next),input.actionId,u.name+(input.kind==="proximity-mine"?"：感応地雷":"：進路妨害フィールド"));
}
/** Legacy formal saves omitted enemy coreLevel; recover the canonical encounter level, never weapon Lv. */
function enemyLevel(s:RobotBattleCoreState,u:RobotBattleUnit){
 if(u.coreLevel!==undefined)return u.coreLevel;
 const stage=getRobotStagePlan(s.key),level=[...stage.initialEnemies,...stage.reinforcements.map(w=>w.squad)].find(e=>e.id===(u.squadId??u.id))?.enemyCoreLevel;
 if(level===undefined||level===null)throw new Error("Adopted enemy core level required for mine damage");return level;
}
/** No reaction attacks or normal weapon effects are dispatched by environmental damage. */
function damage(s:RobotBattleCoreState,z:RobotHazard,targetId:string,raw:number,id:string){
 const target=getRobotBattleUnit(s,targetId),amount=Math.max(1,floorRobotDamageProduct(raw,getRobotDamageFactors(target)));
 const hit=applyRobotPhaseDamage(s,z.ownerId,targetId,amount,id,z.kind==="proximity-mine"?"special:mine":"special:blast-fire");
 const fuses=resolveRobotFuses(hit.state,{});return{state:{...fuses.state,attackIds:[...new Set([...fuses.state.attackIds,id,...fuses.events.map(e=>e.attackId)])]},events:[hit.event,...fuses.events]};
}
/** One enemy fixed fire tick per Core actor turn, shared across overlapping zones. */
function fire(s:RobotBattleCoreState,targetId:string,prefix:string){
 const u=getRobotBattleUnit(s,targetId),zone=s.hazards?.zones.find(z=>z.kind==="persistent-blast-fire"&&u.position&&getRobotHazardCells(s,z).some(c=>sameRobotCoreCell(c,u.position!)));
 if(u.hp<=0||robotBattleIsAlly(u)||!zone||s.hazards!.fireHits.some(h=>h.targetId===targetId&&h.turnSerial===s.turn.serial))return{state:s,events:[] as RobotBattleDamageEvent[]};
 const next={...s,hazards:{...s.hazards!,fireHits:[...s.hazards!.fireHits.filter(h=>h.turnSerial===s.turn.serial),{targetId,turnSerial:s.turn.serial}]}};
 return damage(next,zone,targetId,10,prefix+":fire:"+targetId);
}
/** Resolved legal path only. Placement and position exchange never call this. */
export function moveRobotThroughHazards(s:RobotBattleCoreState,unitId:string,path:readonly RobotPosition[],prefix:string){
 let next=s;const events:RobotBattleDamageEvent[]=[];
 for(const cell of path){
  if(getRobotBattleUnit(next,unitId).hp<=0)break;
  next={...next,units:next.units.map(u=>u.id===unitId?{...u,position:{...cell}}:u)};
  if(robotBattleIsAlly(getRobotBattleUnit(next,unitId)))continue;
  const mines=next.hazards?.zones.filter(z=>z.kind==="proximity-mine"&&distance(z.cell,cell)<=1)??[];
  // All sensors on this entered cell latch together. A prior lethal blast
  // cannot leave another already-triggered mine armed or grant a second kill.
  if(mines.length)next={...next,hazards:{...next.hazards!,zones:next.hazards!.zones.filter(z=>!mines.some(m=>m.id===z.id))}};
  for(const mine of mines){const u=getRobotBattleUnit(next,unitId),id=prefix+":mine:"+mine.id;
   if(u.hp<=0){next={...next,attackIds:[...next.attackIds,id]};events.push({sourceId:mine.ownerId,targetId:unitId,attackId:id,cells:[{...cell}],damage:null,effectKind:"special:mine"});continue;}
   const hit=damage(next,mine,unitId,25+enemyLevel(next,u),id);next=hit.state;events.push(...hit.events);
   next={...next,units:next.units.map(v=>v.id===unitId&&v.hp>0?{...v,mineSlowUntilOwnTurn:v.energy.ownTurn+1}:v)};
  }
  const tick=fire(next,unitId,prefix);next=tick.state;events.push(...tick.events);
 }
 return{state:next,events};
}
export function endRobotHazardTurn(s:RobotBattleCoreState,unitIds:readonly string[],prefix:string){let next=s;const events:RobotBattleDamageEvent[]=[];for(const id of unitIds){const tick=fire(next,id,prefix);next=tick.state;events.push(...tick.events);}return{state:next,events};}
export function expireRobotHazards(s:RobotBattleCoreState):RobotBattleCoreState{return s.hazards?{...s,hazards:{zones:s.hazards.zones.filter(z=>z.expiresRound>=s.allied.round),fireHits:[]}}:s;}
export function assertRobotHazards(s:RobotBattleCoreState){
 for(const u of s.units)if(u.mineSlowUntilOwnTurn!==undefined&&(!Number.isSafeInteger(u.mineSlowUntilOwnTurn)||u.mineSlowUntilOwnTurn<0||u.mineSlowUntilOwnTurn>u.energy.ownTurn+1||u.mineSlowUntilOwnTurn<=u.energy.ownTurn&&!u.energy.turnOpen||u.hp<=0))throw new Error("Invalid mine movement debuff");
 const h=s.hazards;if(!h)return;
 if(!Array.isArray(h.zones)||!Array.isArray(h.fireHits)||new Set(h.zones.map(z=>z.id)).size!==h.zones.length||new Set(h.fireHits.map(v=>v.targetId+":"+v.turnSerial)).size!==h.fireHits.length)throw new Error("Invalid hazard ledger");
 for(const z of h.zones){const owner=s.units.find(u=>u.id===z.ownerId);if(!z.id||z.id.length>512||!["proximity-mine","movement-interference-field","persistent-blast-fire"].includes(z.kind)||!owner||!robotBattleIsAlly(owner)||!hasRobotAddon(owner,z.kind)||!terrainPassable(s,z.cell)||!Number.isSafeInteger(z.placedRound)||z.placedRound<1||z.placedRound>s.allied.round||z.expiresRound!==z.placedRound+1||z.expiresRound<s.allied.round)throw new Error("Invalid adopted hazard state");}
 for(const hit of h.fireHits)if(!s.units.some(u=>u.id===hit.targetId&&!robotBattleIsAlly(u))||!Number.isSafeInteger(hit.turnSerial)||hit.turnSerial<1||hit.turnSerial>s.turn.serial)throw new Error("Invalid fire tick receipt");
}
