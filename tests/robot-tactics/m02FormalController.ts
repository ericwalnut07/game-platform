/** Test-only earned progression and player decisions. Never replaces the actual runtime, enemy roster or AI. */
import { applyRobotOfflineOutcome, createRobotOfflineProgress, type RobotOfflineProgress } from "../../src/games/robot-tactics/offlineProgress";
import { applyRobotCustomization } from "../../src/games/robot-tactics/customization";
import { getRobotBattleActor,getRobotBattleLegalMoves,getRobotBattleUnit,type RobotBattleCoreState } from "../../src/games/robot-tactics/battleState";
import { getRobotBattleMemberNormalPacket,getRobotBattleNormalAttackOptions } from "../../src/games/robot-tactics/battleWeaponActions";
import type { RobotJson } from "../../src/games/robot-tactics/offlineSession";
import type { RobotDifficulty } from "../../src/games/robot-tactics/types";
const progressCache=new Map<RobotDifficulty,RobotOfflineProgress>();
export function m02FormalProgress(difficulty:RobotDifficulty="easy"){
 if(progressCache.has(difficulty))return JSON.parse(JSON.stringify(progressCache.get(difficulty))) as RobotOfflineProgress;
 let p=createRobotOfflineProgress();
 if(difficulty==="easy")p=applyRobotOfflineOutcome(p,{missionNumber:1,difficulty:"easy"},{result:"won",endedRound:5,subobjectiveAchieved:false}).progress;
 else for(const d of ["easy","normal","hard"] as const)for(let n=1;n<=30;n++){if(d===difficulty&&n===2)continue;if(d==="normal"&&!p.cleared.includes("easy-"+String(n).padStart(2,"0")))continue;p=applyRobotOfflineOutcome(p,{missionNumber:n,difficulty:d},{result:"won",endedRound:1,subobjectiveAchieved:false}).progress;}
 for(const coreId of ["core-a","core-b","core-c"] as const){p=applyRobotCustomization(p,{kind:"part-equip",coreId,slot:"weapon2",partId:"assault-rifle"});const max=difficulty==="easy"?(coreId==="core-a"?2:1):41;for(let level=1;level<max;level++)p=applyRobotCustomization(p,{kind:"core-upgrade",coreId});}
 progressCache.set(difficulty,p);return JSON.parse(JSON.stringify(p)) as RobotOfflineProgress;
}
const distance=(a:{x:number;y:number},b:{x:number;y:number})=>Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y));
export function m02PlayerAction(s:RobotBattleCoreState):RobotJson{
 const unit=getRobotBattleUnit(s,getRobotBattleActor(s).unitIds[0]!);if(unit.kind!=="controlled")return{kind:"npc"};
 const boss=getRobotBattleUnit(s,"commander"),positions=[unit.position!,...getRobotBattleLegalMoves(s,unit.id).map(m=>m.destination)];
 const candidates=positions.map(cell=>{const virtual={...s,units:s.units.map(u=>u.id===unit.id?{...u,position:cell}:u)};
 const attacks=unit.parts.flatMap(p=>{try{return getRobotBattleNormalAttackOptions(virtual,p.partId).targetIds.map(targetId=>{const packet=getRobotBattleMemberNormalPacket(virtual,unit.id,p.partId,targetId,"test-only"),target=getRobotBattleUnit(s,targetId);return{weaponId:p.partId,targetId,score:(targetId===boss.id?10000:0)+(packet.packet.targets[0]!.resolution.damage>=target.hp?1000:0)+Math.min(target.hp,packet.packet.targets[0]!.resolution.damage)};});}catch{return[];}}).sort((a,b)=>b.score-a.score);
 return{cell,attack:attacks[0],distance:distance(cell,boss.position!),stay:distance(cell,unit.position!)===0};}).sort((a,b)=>(b.attack?.score??0)-(a.attack?.score??0)||a.distance-b.distance||Number(b.stay)-Number(a.stay));
 const best=candidates[0]!;if(!best.stay)return{kind:"move",destination:{...best.cell}};
 return best.attack?{kind:"normal",weaponId:best.attack.weaponId,targetId:best.attack.targetId}:{kind:"defend"};
}
