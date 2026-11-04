/** Earned advanced build and legal inputs only; no enemy/HP/AI/position injection. */
import {offlineAddonFixtureProgress} from "./offlineAddonFixture";
import {applyRobotCustomization} from "../../src/games/robot-tactics/customization";
import {getRobotBattleActor,getRobotBattleLegalMoves,getRobotBattleUnit,robotBattleIsAlly,type RobotBattleCoreState} from "../../src/games/robot-tactics/battleState";
import {getRobotHazardPlacementOptions,type RobotHazardKind} from "../../src/games/robot-tactics/hazards";
import {getRobotBattleBlastOptions} from "../../src/games/robot-tactics/battleBlast";
import type {RobotJson} from "../../src/games/robot-tactics/offlineSession";
export const hazardFormalCases:readonly RobotHazardKind[]=["proximity-mine","movement-interference-field","persistent-blast-fire"];
export function hazardFormalProgress(kind:RobotHazardKind){let p=offlineAddonFixtureProgress();p=applyRobotCustomization(p,{kind:"part-equip",coreId:"core-c",slot:"weapon2",partId:"howitzer"});p=applyRobotCustomization(p,{kind:"addon-equip",coreId:"core-c",partId:kind});return p;}
const distance=(a:{x:number;y:number},b:{x:number;y:number})=>Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y));
export function hazardFormalAction(s:RobotBattleCoreState,kind:RobotHazardKind):RobotJson{
 const u=getRobotBattleUnit(s,getRobotBattleActor(s).unitIds[0]!);if(u.kind!=="controlled")return{kind:"npc"};if(u.id!=="core-c")return{kind:"charge"};
 const enemies=s.units.filter(v=>v.hp>0&&!robotBattleIsAlly(v));
 if(kind==="persistent-blast-fire"){const o=getRobotBattleBlastOptions(s,"howitzer","fire"),center=o.centers.sort((a,b)=>b.neighborIds.length-a.neighborIds.length)[0];if(center)return{kind:"blast",mode:"fire",weaponId:"howitzer",locations:[{cell:{...center.cell},neighborIds:center.neighborIds.slice(0,2)}]};}
 else{const o=getRobotHazardPlacementOptions(s,kind),rank=o.cells.map(cell=>({cell,d:Math.min(...enemies.map(e=>distance(cell,e.position!)))})).sort((a,b)=>a.d-b.d||distance(u.position!,a.cell)-distance(u.position!,b.cell));if(rank[0]&&rank[0].d<=(kind==="proximity-mine"?2:2))return{kind,cell:{...rank[0].cell}};}
 const moves=getRobotBattleLegalMoves(s,u.id).map(m=>({m,d:Math.min(...enemies.map(e=>distance(m.destination,e.position!)))})).sort((a,b)=>a.d-b.d);if(moves[0])return{kind:"move",destination:{...moves[0].m.destination}};return{kind:"charge"};
}
