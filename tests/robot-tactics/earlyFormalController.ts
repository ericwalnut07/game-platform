/** Test-only earned progression and legal player choices. Never replaces mission/enemy/AI state. */
import { applyRobotOfflineOutcome, createRobotOfflineProgress, type RobotOfflineProgress } from "../../src/games/robot-tactics/offlineProgress";
import { applyRobotCustomization } from "../../src/games/robot-tactics/customization";
import { getRobotStagePlan } from "../../src/games/robot-tactics/stageCatalog";
import { getRobotBattleActor,getRobotBattleLegalMoves,getRobotBattleStructures,getRobotBattleUnit,robotBattleIsAlly,type RobotBattleCoreState } from "../../src/games/robot-tactics/battleState";
import { getRobotBattleNormalAttackOptions,getRobotBattleMemberNormalPacket } from "../../src/games/robot-tactics/battleWeaponActions";
import { getRobotBattleNormalFacilityPacket,getRobotBattleNormalFacilityTargets } from "../../src/games/robot-tactics/battleFacilityActions";
import { getRobotExtraMoveOptions } from "../../src/games/robot-tactics/commonCombat";
import { getRobotEarlyDataAction,robotEarlyGoalCells } from "../../src/games/robot-tactics/earlyMissions";
import { getRobotLegalMoves,robotCellToPosition,type RobotPosition } from "../../src/games/robot-tactics/movement";
import type {RobotStageKey} from "../../src/games/robot-tactics/types";
import type {RobotJson} from "../../src/games/robot-tactics/offlineSession";
let baseProgress:RobotOfflineProgress|undefined;const cache=new Map<string,RobotOfflineProgress>();
const won={result:"won" as const,endedRound:5,subobjectiveAchieved:false};
export function earlyFormalProgress(key:RobotStageKey):RobotOfflineProgress {
 const name=key.difficulty+key.missionNumber;if(cache.has(name))return JSON.parse(JSON.stringify(cache.get(name))) as RobotOfflineProgress;
 if(!baseProgress){let p=createRobotOfflineProgress();p=applyRobotOfflineOutcome(p,{missionNumber:1,difficulty:"easy"},won).progress;p=applyRobotOfflineOutcome(p,{missionNumber:1,difficulty:"normal"},won).progress;
  while(p.exp<70000)p=applyRobotOfflineOutcome(p,{missionNumber:1,difficulty:"normal"},won).progress;
  for(const coreId of ["core-a","core-b","core-c"] as const){for(let l=1;l<41;l++)p=applyRobotCustomization(p,{kind:"core-upgrade",coreId});const frameId=coreId==="core-a"?"mobile-1":coreId==="core-b"?"attack-1":"defense-1";if(p.party.find(c=>c.coreId===coreId)!.frameId!==frameId)p=applyRobotCustomization(p,{kind:"frame",coreId,frameId});p=applyRobotCustomization(p,{kind:"part-equip",coreId,slot:"weapon2",partId:coreId==="core-b"?"corrosion-rifle":"assault-rifle"});}
  p=applyRobotCustomization(p,{kind:"frame",coreId:"core-a",frameId:"reactor-1"});
  for(const partId of new Set(p.party.flatMap(c=>Object.values(c.basic).map(p=>p.partId))))for(let l=1;l<10;l++)p=applyRobotCustomization(p,{kind:"part-upgrade",coreId:"core-a",partId});baseProgress=p;
 }
 let p=JSON.parse(JSON.stringify(baseProgress)) as RobotOfflineProgress;
 const easyEnd=key.difficulty==="easy"?key.missionNumber-1:30;
 for(let missionNumber=2;missionNumber<=easyEnd;missionNumber++)p=applyRobotOfflineOutcome(p,{missionNumber,difficulty:"easy"},{...won,endedRound:getRobotStagePlan({missionNumber,difficulty:"easy"}).roundLimit}).progress;
 cache.set(name,p);return JSON.parse(JSON.stringify(p)) as RobotOfflineProgress;
}
const dist=(a:RobotPosition,b:RobotPosition)=>Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y));
const keyOf=(c:RobotPosition)=>c.x+","+c.y;
/** Grid routing chooses among Core-approved moves; it never moves a unit itself. */
function distances(s:RobotBattleCoreState,unitId:string,goals:readonly RobotPosition[]){const blocked=new Set([...s.board.walls,...getRobotBattleStructures(s),...s.units.filter(u=>u.id!==unitId&&u.hp>0).map(u=>u.position!)].map(keyOf)),map=new Map<string,number>(),queue=[...goals];goals.forEach(c=>map.set(keyOf(c),0));for(let i=0;i<queue.length;i++){const c=queue[i]!;for(const move of getRobotLegalMoves({board:s.board,origin:c,mov:1,types:["omni"],facing:"north",occupied:[],structures:[...blocked].filter(k=>k!==keyOf(c)).map(k=>{const [x,y]=k.split(",").map(Number);return{x:x!,y:y!};})})){const k=keyOf(move.destination);if(!map.has(k)){map.set(k,map.get(keyOf(c))!+1);queue.push(move.destination);}}}return map;}
export function earlyFormalAction(s:RobotBattleCoreState):RobotJson {
 const u=getRobotBattleUnit(s,getRobotBattleActor(s).unitIds[0]!);if(u.kind!=="controlled")return{kind:"npc"};if(s.objective.kind!=="early")throw new Error("early controller only");
 const m=s.objective.state,mission=s.key.missionNumber,targets=s.units.filter(v=>v.hp>0&&!robotBattleIsAlly(v));let goals:readonly RobotPosition[]=[];
 if(mission===3||mission===10){if(m.arrivedIds.includes(u.id))return{kind:"defend"};goals=robotEarlyGoalCells(s.key);}
 if(mission===4){const objects=m.objects.objects.filter(o=>o.hp>0),assigned=objects.find(o=>o.id===(u.id==="core-a"?"depot-left":"depot-right"));goals=(assigned?[assigned]:objects).flatMap(o=>o.cells);}
 if(mission===9){const boss=getRobotBattleUnit(s,"moving-commander");goals=boss.hp>0&&boss.position?[boss.position]:[u.position!];}
 if(mission===8){const facility=m.objects.objects[0]!,priority=[...targets].sort((a,b)=>dist(a.position!,facility.cells[0]!)-dist(b.position!,facility.cells[0]!));goals=priority[0]?[priority[0].position!]:[facility.cells[0]!];}
 if(mission===5){const convoy=m.objects.objects[0]!;const priority=[...targets].sort((a,b)=>dist(a.position!,convoy.cells[0]!)-dist(b.position!,convoy.cells[0]!));goals=priority[0]?[priority[0].position!]:[convoy.route.at(-1)!];}
 if(mission===6)goals=[robotEarlyGoalCells(s.key)[["core-a","core-b","core-c"].indexOf(u.id)]!];
 const dataRunner=mission===7?(m.data!.carrierId??s.units.find(v=>v.kind==="controlled"&&v.hp>0)!.id):null;
 if(mission===7){if(u.id===dataRunner){for(const kind of ["pickup","transmit"] as const)if(!getRobotEarlyDataAction(s,u.id,kind))return{kind};goals=m.data!.carrierId?[robotCellToPosition("I13")]:[m.data!.cell!];}else{const threat=[...targets].sort((a,b)=>dist(a.position!,u.position!)-dist(b.position!,u.position!))[0];goals=threat?[threat.position!]:[u.position!];}}
 const attacks=u.parts.flatMap(p=>{try{const normal=getRobotBattleNormalAttackOptions(s,p.partId);const robots=normal.targetIds.map(targetId=>({targetId,weaponId:p.partId,score:(mission===9&&targetId==="moving-commander"?100000:0)+(mission===6&&goals.some(g=>dist(g,getRobotBattleUnit(s,targetId).position!)===0)?10000:0)+(getRobotBattleMemberNormalPacket(s,u.id,p.partId,targetId,"controller-preview").packet.targets[0]!.resolution.damage>=getRobotBattleUnit(s,targetId).hp?1000:0)+Math.min(getRobotBattleUnit(s,targetId).hp,getRobotBattleMemberNormalPacket(s,u.id,p.partId,targetId,"controller-preview").packet.targets[0]!.resolution.damage)}));const objects=mission===4?[...new Set(getRobotBattleNormalFacilityTargets(s,u.id,p.partId).map(t=>t.objectId))].map(targetId=>{const t=getRobotBattleNormalFacilityTargets(s,u.id,p.partId).find(t=>t.objectId===targetId)!,d=getRobotBattleNormalFacilityPacket(s,{unitId:u.id,weaponId:p.partId,...t},"preview").packet.targets[0]!.resolution.damage;return{targetId,weaponId:p.partId,score:10000+d};}):[];return[...robots,...objects];}catch{return[];}}).sort((a,b)=>b.score-a.score);
 if(attacks[0]&&(mission===4&&attacks[0].score>=10000||mission===5||mission===8||mission===9&&attacks[0].targetId==="moving-commander"||mission===7&&u.id!==dataRunner||mission===6&&goals.some(c=>dist(c,u.position!)===0)))return{kind:"normal",weaponId:attacks[0].weaponId,targetId:attacks[0].targetId};
 const distance=distances(s,u.id,goals),rank=(c:RobotPosition)=>distance.get(keyOf(c))??1000+Math.min(...goals.map(g=>dist(c,g))),avoid=(c:RobotPosition)=>mission===5&&m.objects.objects[0]!.route.some(p=>dist(p,c)===0)||mission===7&&u.id!==dataRunner&&robotEarlyGoalCells(s.key).some(p=>dist(p,c)===0);
 const moves=getRobotBattleLegalMoves(s,u.id).filter(m=>!avoid(m.destination)).sort((a,b)=>rank(a.destination)-rank(b.destination)||a.path.length-b.path.length||a.destination.y-b.destination.y||a.destination.x-b.destination.x);
 if(moves[0]&&rank(moves[0].destination)<rank(u.position!))return{kind:"move",destination:{...moves[0].destination}};
 if(u.energy.moved&&[3,4,7,9,10].includes(mission)){const extra=getRobotExtraMoveOptions(s),best=[...extra.moves].filter(m=>!avoid(m.destination)).sort((a,b)=>rank(a.destination)-rank(b.destination))[0];if(best&&rank(best.destination)<rank(u.position!))return{kind:"extra-move",destination:{...best.destination}};}
 if(attacks[0])return{kind:"normal",weaponId:attacks[0].weaponId,targetId:attacks[0].targetId};return{kind:"defend"};
}
