import { getRobotUnweakenedDefense } from "./battleEffects";
import { resolveRobotTargetDamage } from "./attackResolution";
import catalog from "../../../docs/design/robot-tactics/addons.json";
import { getRobotCombatWeapon, getRobotAddonCost } from "./combatAddons";
import { getRobotActionEnergyBlock } from "./energy";
import { resolveRobotBasicPart } from "./equipment";
import { getRobotBattleActor, getRobotBattleFacilities, getRobotBattleUnit, requireRobotBattleInput, robotBattleIsAlly, type RobotBattleCoreState } from "./battleState";
import { getRobotSpecialFacilityCells } from "./specialFacilityActions";
import type { RobotPosition } from "./movement";
import { robotWeaponReaches } from "./battleEffects";
import { getRobotSpecialWeaponPacket } from "./battleWeaponActions";
import { commitRobotBattleBatch } from "./battleBatch";
export type RobotRemainingStrike = "sniper-penetration" | "thrust-linear-pierce" | "anti-materiel-focus" | "crush-immobilizer" | "function-lock-round" | "debuff-transfer-round";
function actor(s: RobotBattleCoreState, weaponId: string) {
  const a=getRobotBattleActor(s), source=getRobotBattleUnit(s,a.unitIds[0]!), selected=source.parts.find(p=>p.partId===weaponId);
  if(a.unitIds.length!==1||source.kind!=="controlled"||!source.position||source.hp===0||source.energy.action) throw new Error("Current controlled special actor required");
  const weapon=selected&&getRobotCombatWeapon(resolveRobotBasicPart(selected.partId,selected.level),source.addons);
  return {source,weapon};
}
export function getRobotRemainingStrikeOptions(s:RobotBattleCoreState,kind:RobotRemainingStrike,weaponId:string){
  const {source,weapon}=actor(s,weaponId), part=catalog.parts.find(p=>p.id===kind)!;
  if(!part)throw new Error("Unknown special addon");
  const energyCost=getRobotAddonCost(kind), family=kind==="thrust-linear-pierce"?"thrust":kind==="crush-immobilizer"?"blunt":(kind==="function-lock-round"||kind==="debuff-transfer-round")?"assault":"sniper";
  let disabledReason=!source.addons?.some(a=>a.partId===kind)?"対応パーツが必要です":weapon?.weaponFamily!==family?"対応する装備武器が必要です":(weapon.rarity??0)<(part.minimumWeaponRarity??0)?"武器レアリティが条件を満たしていません":kind==="anti-materiel-focus"&&(source.energy.moved||source.energy.usedExtraMove)?"移動せずに使用してください":getRobotActionEnergyBlock(source.energy,energyCost);
  const enemies=disabledReason?[]:[
    ...s.units.filter(u=>u.hp>0&&u.position&&!robotBattleIsAlly(u)&&robotWeaponReaches(s,source,u,weapon!)).map(u=>({id:u.id,cell:u.position!})),
    ...getRobotSpecialFacilityCells(s,source.id,weapon!.id,weapon!.range!).map(o=>({id:o.objectId,cell:o.cell})),
  ];
  const targetSets:string[][]=[];
  if(kind==="sniper-penetration"||kind==="thrust-linear-pierce"){
    for(const front of enemies)for(const back of enemies){
      if(front.id===back.id)continue;
      const a={x:front.cell.x-source.position!.x,y:front.cell.y-source.position!.y}, b={x:back.cell.x-source.position!.x,y:back.cell.y-source.position!.y};
      if(a.x*b.y===a.y*b.x&&a.x*b.x+a.y*b.y>0&&a.x*a.x+a.y*a.y<b.x*b.x+b.y*b.y)targetSets.push([front.id,back.id]);
    }
  } else if (kind === "debuff-transfer-round") {
    // The follow-up normal-hit effect is robot-only; facility may be the
    // primary damage target but never receives debuffs, EN loss or roots.
    for(const primary of enemies) for(const secondary of s.units.filter(u=>u.id!==primary.id&&u.hp>0&&u.position&&!robotBattleIsAlly(u)&&Math.max(Math.abs(u.position.x-primary.cell.x),Math.abs(u.position.y-primary.cell.y))===1)) targetSets.push([primary.id,secondary.id]);
  }else targetSets.push(...enemies.map(u=>[u.id]));
  const unique=[...new Map(targetSets.map(ids=>[ids.join(":"),ids])).values()];
  disabledReason??=unique.length?null:"合法な対象がありません（射程・射線・直線配置を確認）";
  return {energyCost,targetSets:unique,disabledReason};
}
export function commitRobotRemainingStrike(s:RobotBattleCoreState,input:{readonly actionId:string;readonly turnId:string;readonly kind:RobotRemainingStrike;readonly weaponId:string;readonly targetIds:readonly string[]}){
  if(!requireRobotBattleInput(s,input.actionId,input.turnId))return s;
  const options=getRobotRemainingStrikeOptions(s,input.kind,input.weaponId);
  if(options.disabledReason||!options.targetSets.some(ids=>ids.length===input.targetIds.length&&ids.every((id,i)=>id===input.targetIds[i])))throw new Error(options.disabledReason??"Ordered legal targets required");
  const effect = catalog.parts.find(p=>p.id===input.kind)!.effect as { multipliers?:number[]; damageMultiplier?:number; primaryDamageMultiplier?:number; ignoreDefFraction?:number };
  const {source,weapon}=actor(s,input.weaponId), linear=input.kind==="sniper-penetration"||input.kind==="thrust-linear-pierce", multiplier=effect.damageMultiplier ?? effect.primaryDamageMultiplier ?? 1;
  const linearCells: RobotPosition[]=[];
  if(linear){
    const choices=input.targetIds.map(id=>s.units.find(u=>u.id===id)?.position
      ? [getRobotBattleUnit(s,id).position!]
      : getRobotSpecialFacilityCells(s,source.id,input.weaponId,weapon!.range!).filter(c=>c.objectId===id).map(c=>c.cell));
    let matched: [RobotPosition,RobotPosition] | null = null;
    for(const front of choices[0]??[])for(const back of choices[1]??[]){
      const a={x:front.x-source.position!.x,y:front.y-source.position!.y},b={x:back.x-source.position!.x,y:back.y-source.position!.y};
      if(!matched && a.x*b.y===a.y*b.x&&a.x*b.x+a.y*b.y>0&&a.x*a.x+a.y*a.y<b.x*b.x+b.y*b.y)matched=[front,back];
    }
    if(matched)linearCells.push(...matched);
    if(linearCells.length!==2)throw new Error("Illegal linear special footprint arrangement");
  }
  const attacks=(input.kind==="debuff-transfer-round"?input.targetIds.slice(0,1):input.targetIds).map((id,i)=>{
    const defense=s.units.some(u=>u.id===id)
      ? getRobotUnweakenedDefense(s,getRobotBattleUnit(s,id))
      : getRobotBattleFacilities(s).find(o=>o.id===id)?.def;
    if(defense===undefined)throw new Error("Unknown special target defense");
    const defenseMultiplier=input.kind==="anti-materiel-focus"
      ? Number((1-Math.max(.10,Math.min(.45,.25+.005*(defense-80)))).toFixed(12))
      : 1-(effect.ignoreDefFraction??0);
    return getRobotSpecialWeaponPacket(s,input.weaponId,id,input.actionId+":special:"+i,weapon!.range!,linear?effect.multipliers![i]!:multiplier,"normal",undefined,defenseMultiplier,linear?linearCells[i]:undefined);
  });
  if(input.kind==="debuff-transfer-round"){
    const secondary=getRobotBattleUnit(s,input.targetIds[1]!);
    attacks[0]={...attacks[0]!,targets:[...attacks[0]!.targets,{entityId:secondary.id,cells:[secondary.position!],resolution:resolveRobotTargetDamage({attackLegal:true,spatial:{canReach:true,reason:"clear",sight:null},effect:{kind:"non-damaging"}})}]};
  }
  return commitRobotBattleBatch(s,{actionId:input.actionId,turnId:input.turnId,summary:source.name+"："+catalog.parts.find(p=>p.id===input.kind)!.name,members:[{unitId:source.id,action:{kind:"other",energyCost:options.energyCost}}],attacks,
    ...(input.kind==="debuff-transfer-round"?{transferredHitEffects:[{sourceId:source.id,weaponId:input.weaponId,targetIds:input.targetIds}]}:{}),
    ...(s.units.some(u=>u.id===input.targetIds[0])&&(input.kind==="crush-immobilizer"||input.kind==="function-lock-round")?{restrictions:[{sourceId:source.id,targetId:input.targetIds[0]!,kind:input.kind}]}:{})});
}
