import { applyRobotObjectiveObjectBatch, advanceRobotObjectiveTransports, createRobotObjectiveObjects, type RobotObjectiveObjectsState } from "./objectiveObjects";
import { chooseRobotReinforcementCells } from "./reinforcementPlacement";
import { getRobotStagePlan } from "./stageCatalog";
import { robotCellToPosition, type RobotPosition } from "./movement";
import type { RobotStageKey } from "./types";
import type { RobotBattleCoreState, RobotBattleDamageEvent, RobotBattleUnit } from "./battleState";
export const ROBOT_M07_DATA_ID = "m07-mission-data";
export const ROBOT_M14_DATA_ID = "m14-mission-data";
export const robotMissionDataId=(n:number)=>n===14?ROBOT_M14_DATA_ID:n===21?"m21-mission-data":[24,27,29].includes(n)?`m${n}-mission-data`:ROBOT_M07_DATA_ID;
const lateData:Record<number,[string,string]>={24:["M6","I13"],27:["L3","J14"],29:["J3","I14"]};
const lateBases:Record<number,string[]>={26:["F5","J4","N5"],28:["E6","J4","O6"]};
import type {RobotSubobjectiveEvent} from "./subobjectives";
export interface RobotEarlyMissionState {
  readonly missionNumber: number;
  readonly lateSubobjectiveEvents?: readonly RobotSubobjectiveEvent[];
  readonly subobjectiveHistory?: {
    readonly depotDamageSources: Readonly<Record<string, readonly string[]>>;
    readonly centralBaseOccupied: boolean;
    readonly dataDropped: boolean;
    readonly preCrossDamageIds?: readonly string[];
    readonly depotFinalBlows?: Readonly<Record<string, string>>;
    readonly lastTransportGuardRound?: number | null;
  };
  /** First authoritative M09 offensive-formation HP-damage receipt, retained over reloads. */
  readonly m09FormationHit?: { readonly attackId:string; readonly sourceId:string; readonly targetId:string; readonly technique:"line"|"delta"; readonly hpRemoved:number } | null;
  /** M10 permanent defeat ledger; the first crossing actor must never be defeated, including before crossing. */
  readonly m10DefeatedIds?: readonly string[];
  /** M14 trusted first controlled kill of a post-pickup pursuer, before upload. */
  readonly m14PursuerKill?: { readonly attackId:string; readonly sourceId:string; readonly targetId:string } | null;
  /** M11 authoritative per-depot final blow; each depot has one independent HP pool. */
  readonly m11FinalBlows?: Readonly<Record<string,{ readonly sourceId:string; readonly attackId:string }>>;
  readonly objects: RobotObjectiveObjectsState;
  readonly arrivedIds: readonly string[];
  readonly controlOwners: readonly ("allied"|"enemy"|"neutral")[];
  readonly controlStreak: number;
  readonly data: { readonly cell: RobotPosition|null; readonly carrierId: string|null; readonly sent: boolean; readonly collectedRound: number|null } | null;
  readonly waveDueRound: number|null;
  readonly waveBranch: string|null;
  readonly spawnedWaveIds: readonly string[];
  readonly result: "ongoing"|"won"|"lost";
  readonly resultReason: "breakthrough-complete"|"depots-destroyed"|"transport-arrived"|"bases-controlled"|"data-transmitted"|"transport-destroyed"|"facility-destroyed"|"facility-survived"|"boss-defeated"|"facility-and-boss-complete"|"depots-and-bases-complete"|"convoy-and-data-complete"|"depots-and-breakthrough-complete"|"convoy-and-bases-complete"|"boss-and-data-complete"|"facility-and-bases-complete"|"depots-and-data-complete"|"same-round-controlled-wipe"|"round-limit"|null;
}
const same=(a:RobotPosition,b:RobotPosition)=>a.x===b.x&&a.y===b.y;
const allied=(u:RobotBattleUnit)=>u.kind==="controlled"||u.kind==="friendly-ai";
export function createRobotEarlyMission(key:RobotStageKey):RobotEarlyMissionState {
  if(key.missionNumber<3||key.missionNumber>14&&![15,16,17,18,19,20,21,22,23,24,25,26,27,28,29].includes(key.missionNumber))throw new Error("M03-M23 objective required");
  return{...(key.missionNumber>=24?{lateSubobjectiveEvents:[]}:{}),subobjectiveHistory:{depotDamageSources:{"depot-left":[],"depot-right":[]},centralBaseOccupied:false,dataDropped:false,
    ...(key.missionNumber===3 ? {preCrossDamageIds:[]} : {}),
    ...(key.missionNumber===4 ? {depotFinalBlows:{}} : {}),
    ...(key.missionNumber===5 ? {lastTransportGuardRound:null} : {})},missionNumber:key.missionNumber,...(key.missionNumber===9?{m09FormationHit:null}:{}),...(key.missionNumber===10?{m10DefeatedIds:[]}:{}),...(key.missionNumber===11?{m11FinalBlows:{}}:{}),...(key.missionNumber===14?{m14PursuerKill:null}:{}),objects:createRobotObjectiveObjects(getRobotStagePlan(key)),arrivedIds:[],controlOwners:[6,13,20,23,26,28].includes(key.missionNumber)?["neutral","neutral","neutral"]:[],controlStreak:0,data:[7,14,21,24,27,29].includes(key.missionNumber)?{cell:robotCellToPosition(lateData[key.missionNumber]?.[0]??(key.missionNumber===21?"I2":"J3")),carrierId:null,sent:false,collectedRound:null}:null,waveDueRound:null,waveBranch:null,spawnedWaveIds:[],result:"ongoing",resultReason:null};
}
export function robotEarlyGoalCells(key:RobotStageKey):readonly RobotPosition[] {
  const o=getRobotStagePlan(key).objective.specification;
  if(key.missionNumber===25){const conditions=o.conditions as {kind:string;breakthroughCells?:string[]}[];return (conditions.find(x=>x.kind==="cross-enemy-line")?.breakthroughCells??[]).map(robotCellToPosition);}
  if([3,10,17].includes(key.missionNumber))return(o.breakthroughCells as string[]).map(robotCellToPosition);
  if([6,13,20].includes(key.missionNumber))return(o.bases as {cell:string}[]).map(b=>robotCellToPosition(b.cell));
  if(lateBases[key.missionNumber])return lateBases[key.missionNumber]!.map(robotCellToPosition);
  if([7,14].includes(key.missionNumber))return[robotCellToPosition("J3"),robotCellToPosition("I13")];
  if(key.missionNumber===5||key.missionNumber===12)return[robotCellToPosition((o.transport as {goalCell:string}).goalCell)];
  return[];
}
/** Count a controlled unit once, after a voluntary movement ends on a goal. */
export function recordRobotEarlyEntry(s:RobotBattleCoreState,unitId:string,cell:RobotPosition):RobotBattleCoreState {
  if(s.objective.kind!=="early"||![3,10,17,25].includes(s.key.missionNumber))return s;
  const u=s.units.find(u=>u.id===unitId)!,m=s.objective.state;
  if(u.kind!=="controlled"||u.hp<=0||m.arrivedIds.includes(unitId)||!robotEarlyGoalCells(s.key).some(c=>same(c,cell)))return s;
  return{...s,objective:{kind:"early",state:{...m,arrivedIds:[...m.arrivedIds,unitId],
    ...(m.missionNumber===10&&m.arrivedIds.length===0?{waveDueRound:s.allied.round+1}:{})}}};
}
/** Called while applying damage, so a later landing cannot reverse event order. */
export function recordRobotPreCrossDamage(s: RobotBattleCoreState, sourceId: string, targetId: string, actualDamage: number): RobotBattleCoreState {
  if (s.key.missionNumber !== 3 || s.objective.kind !== "early" || actualDamage <= 0) return s;
  const mission = s.objective.state;
  const history = mission.subobjectiveHistory;
  if (!history?.preCrossDamageIds || mission.arrivedIds.includes(sourceId) || history.preCrossDamageIds.includes(sourceId)) return s;
  const source = s.units.find(unit => unit.id === sourceId);
  const target = s.units.find(unit => unit.id === targetId);
  if (source?.kind !== "controlled" || !target || allied(target)) return s;
  return { ...s, objective: { kind: "early", state: {
    ...mission, subobjectiveHistory: { ...history, preCrossDamageIds: [...history.preCrossDamageIds, sourceId] },
  } } };
}
function outcome(m:RobotEarlyMissionState,wipe:boolean,bossDefeated=false):RobotEarlyMissionState {
  if(wipe)return{...m,result:"lost",resultReason:"same-round-controlled-wipe"};
  if([5,12,19,24,26].includes(m.missionNumber)&&m.objects.objects[0]!.hp===0)return{...m,result:"lost",resultReason:"transport-destroyed"};
  if([8,15,22,28].includes(m.missionNumber)&&m.objects.objects[0]!.hp===0)return{...m,result:"lost",resultReason:"facility-destroyed"};
  if(m.missionNumber===24&&m.objects.objects[0]!.routeIndex===m.objects.objects[0]!.route.length-1&&m.data?.sent)return{...m,result:"won",resultReason:"convoy-and-data-complete"};
  if(m.missionNumber===25&&m.objects.objects.every(o=>o.hp===0)&&m.arrivedIds.length>=2)return{...m,result:"won",resultReason:"depots-and-breakthrough-complete"};
  if(m.missionNumber===26&&m.objects.objects[0]!.routeIndex===m.objects.objects[0]!.route.length-1&&m.controlStreak>=2)return{...m,result:"won",resultReason:"convoy-and-bases-complete"};
  if(m.missionNumber===27&&bossDefeated&&m.data?.sent)return{...m,result:"won",resultReason:"boss-and-data-complete"};
  if(m.missionNumber===28&&m.objects.completedRound>=12&&m.controlStreak>=2)return{...m,result:"won",resultReason:"facility-and-bases-complete"};
  if(m.missionNumber===29&&m.objects.objects.every(o=>o.hp===0)&&m.data?.sent)return{...m,result:"won",resultReason:"depots-and-data-complete"};
  if(m.missionNumber===23&&m.objects.objects.every(o=>o.hp===0)&&m.controlStreak>=2)return{...m,result:"won",resultReason:"depots-and-bases-complete"};
  if(m.missionNumber===22&&bossDefeated&&m.objects.completedRound>=11)return{...m,result:"won",resultReason:"facility-and-boss-complete"};
  if([9,16].includes(m.missionNumber)&&bossDefeated)return{...m,result:"won",resultReason:"boss-defeated"};
  const reason=[3,10,17].includes(m.missionNumber)&&m.arrivedIds.length>=2?"breakthrough-complete":[4,11,18].includes(m.missionNumber)&&m.objects.objects.every(o=>o.hp===0)?"depots-destroyed":[5,12].includes(m.missionNumber)&&m.objects.objects[0]!.routeIndex===m.objects.objects[0]!.route.length-1?"transport-arrived":[6,13,20].includes(m.missionNumber)&&m.controlStreak>=2?"bases-controlled":[7,14,21].includes(m.missionNumber)&&m.data!.sent?"data-transmitted":[8,15].includes(m.missionNumber)&&m.objects.completedRound>= (m.missionNumber===15?8:7)?"facility-survived":null;
  return reason?{...m,result:"won",resultReason:reason}:m;
}
/** Reconcile one resolved action; environmental/attack damage is already authoritative. */
/** Record actual positive enemy HP damage from a settled M09 Line/Delta action.
 * The immutable attack receipt prevents an equipment-only or preview hit from
 * satisfying the historic Normal/Hard subobjective.
 */
export function recordRobotM09FormationDamage(before:RobotBattleCoreState, after:RobotBattleCoreState, events:readonly RobotBattleDamageEvent[]):RobotBattleCoreState {
  if(before.key.missionNumber!==9||after.objective.kind!=="early"||after.objective.state.m09FormationHit)return after;
  const hit=events.find(e=> {
    const source=before.units.find(u=>u.id===e.sourceId),target=before.units.find(u=>u.id===e.targetId);
    return (e.effectKind==="line"||e.effectKind==="delta")&&e.damage!==null&&e.damage>0&&
      !!source&&allied(source)&&!!target&&!allied(target)&&target.hp>0;
  });
  if(!hit)return after;
  const prior=before.units.find(u=>u.id===hit.targetId)!;
  return {...after,objective:{kind:"early",state:{...after.objective.state,m09FormationHit:{
    attackId:hit.attackId,sourceId:hit.sourceId,targetId:hit.targetId,
    technique:hit.effectKind as "line"|"delta",hpRemoved:Math.min(prior.hp,hit.damage!)
  }}}};
}
/** Preserve only a trusted post-pickup, pre-upload controlled final blow.
 * Do not trust an actor label, target flag, or client-supplied damage record.
 * Each event must remove actual HP from a canonical R-after-pickup wave unit.
 */
export function recordRobotM14PursuerKill(before:RobotBattleCoreState,after:RobotBattleCoreState,events:readonly RobotBattleDamageEvent[]):RobotBattleCoreState {
  if(before.key.missionNumber!==14||after.objective.kind!=="early")return after;
  const m=after.objective.state;
  if(m.m14PursuerKill||!m.data||m.data.sent||m.data.collectedRound===null||
    !m.spawnedWaveIds.includes("data-pursuers"))return after;
  const victims=before.units.filter(u=>u.squadId==="return-raiders"&&u.hp>0&&after.units.find(v=>v.id===u.id)?.hp===0);
  for(const victim of victims){
    const strikes=events.filter(e=>e.targetId===victim.id&&e.damage!==null&&e.damage>0);
    if(strikes.reduce((n,e)=>n+e.damage!,0)<victim.hp)continue;
    const killer=strikes.find(e=>before.units.some(u=>u.id===e.sourceId&&u.kind==="controlled"));
    if(!killer||!after.attackIds.includes(killer.attackId))continue;
    return {...after,objective:{kind:"early",state:{...m,m14PursuerKill:{sourceId:killer.sourceId,targetId:victim.id,attackId:killer.attackId}}}};
  }
  return after;
}
/** Record only real pre-pickup controlled HP damage to M27's boss. */
export function recordRobotLateBossDamage(before:RobotBattleCoreState,after:RobotBattleCoreState,events:readonly RobotBattleDamageEvent[]):RobotBattleCoreState {
  if(after.key.missionNumber!==27||after.objective.kind!=="early"||after.objective.state.data?.collectedRound!==null)return after;
  const receipts:RobotSubobjectiveEvent[]=[];
  for(const event of events){if(event.targetId!=="archive-command-unit"||!event.damage||event.damage<=0)continue;
    const source=before.units.find(u=>u.id===event.sourceId&&u.kind==="controlled"),target=before.units.find(u=>u.id===event.targetId);
    if(!source||!target||target.hp<=0)continue;
    receipts.push({kind:"damage",sourceId:source.id,source:"controlled",targetId:target.id,target:"enemy",hpRemoved:Math.min(target.hp,event.damage),lethal:event.damage>=target.hp});
  }
  if(!receipts.length)return after;
  const m=after.objective.state;
  return {...after,objective:{kind:"early",state:{...m,lateSubobjectiveEvents:[...(m.lateSubobjectiveEvents??[]),...receipts]}}};
}
export function reconcileRobotEarlyMission(s:RobotBattleCoreState,attacks:readonly {attackId:string;sourceId?:string;hitCells:readonly RobotPosition[];damage:number}[]=[],dropped:readonly {unitId:string;position:RobotPosition}[]=[],defeated:readonly string[]=[]):RobotBattleCoreState {
  if(s.objective.kind!=="early")return s;
  const next=s;
  let m=(next.objective as {kind:"early";state:RobotEarlyMissionState}).state;
  if(m.missionNumber===10&&defeated.length)m={...m,m10DefeatedIds:[...new Set([...(m.m10DefeatedIds??[]),...defeated.filter(id=>s.units.some(u=>u.id===id&&u.kind==="controlled"))])]};
  if(m.missionNumber===11&&attacks.length){
    const finalBlows={...(m.m11FinalBlows??{})}, remaining=new Map(m.objects.objects.map(object=>[object.id,object.hp]));
    const seen=new Set(m.objects.appliedAttackIds);
    for(const attack of attacks){
      if(attack.damage<=0||seen.has(attack.attackId))continue;
      const source=s.units.find(u=>u.id===attack.sourceId&&allied(u));
      for(const depot of m.objects.objects){
        if(!depot.cells.some(cell=>attack.hitCells.some(hit=>same(hit,cell))))continue;
        const hp=remaining.get(depot.id)!;
        if(hp<=0)continue;
        const actual=Math.min(hp,attack.damage);
        remaining.set(depot.id,hp-actual);
        if(source&&actual===hp)finalBlows[depot.id]={sourceId:source.id,attackId:attack.attackId};
      }
    }
    m={...m,m11FinalBlows:finalBlows};
  }
  if(m.subobjectiveHistory && m.missionNumber === 4) {
    const sources = { ...m.subobjectiveHistory.depotDamageSources };
    const finalBlows = m.subobjectiveHistory.depotFinalBlows && { ...m.subobjectiveHistory.depotFinalBlows };
    const remaining = new Map(m.objects.objects.map(object => [object.id, object.hp]));
    const committed = new Set(m.objects.appliedAttackIds);
    for (const hit of attacks) {
      if (hit.damage <= 0 || committed.has(hit.attackId)) continue;
      const source = s.units.find(unit => unit.id === hit.sourceId && unit.kind === "controlled");
      for (const object of m.objects.objects) {
        if (!hit.hitCells.some(cell => object.cells.some(position => same(cell, position)))) continue;
        const hp = remaining.get(object.id)!;
        const actual = Math.min(hp, hit.damage);
        remaining.set(object.id, hp - actual);
        if (!source || actual === 0) continue;
        sources[object.id] = [...new Set([...(sources[object.id] ?? []), source.id])];
        if (finalBlows && actual === hp) finalBlows[object.id] = source.id;
      }
    }
    m = { ...m, subobjectiveHistory: { ...m.subobjectiveHistory, depotDamageSources: sources, ...(finalBlows ? { depotFinalBlows: finalBlows } : {}) } };
  }
  if([25,29].includes(m.missionNumber)&&attacks.length){
    const remaining=new Map(m.objects.objects.map(o=>[o.id,o.hp]));
    const seen=new Set(m.objects.appliedAttackIds);
    const receipts:RobotSubobjectiveEvent[]=[];
    for(const a of attacks){if(seen.has(a.attackId)||a.damage<=0)continue;seen.add(a.attackId);
      const source=s.units.find(u=>u.id===a.sourceId&&u.kind==="controlled");
      if(!source)continue;
      for(const o of m.objects.objects){if(!o.cells.some(cell=>a.hitCells.some(hit=>same(cell,hit))))continue;
        const hp=remaining.get(o.id)??0,actual=Math.min(hp,a.damage);remaining.set(o.id,hp-actual);
        if(actual>0)receipts.push({kind:"damage",sourceId:source.id,source:"controlled",targetId:o.id,target:"depot",hpRemoved:actual,lethal:actual===hp});
      }
    }
    if(receipts.length)m={...m,lateSubobjectiveEvents:[...(m.lateSubobjectiveEvents??[]),...receipts]};
  }
  if(attacks.length){const grouped=new Map<string,{objectId:string;cells:readonly RobotPosition[];damage:number}[]>();for(const a of attacks){const hits=grouped.get(a.attackId)??[];for(const o of m.objects.objects)if(a.hitCells.some(c=>o.cells.some(p=>same(p,c)))){if(hits.some(h=>h.objectId===o.id))throw new Error("An attack must damage each objective HP pool only once");hits.push({objectId:o.id,cells:a.hitCells.filter(c=>o.cells.some(p=>same(p,c))),damage:a.damage});}grouped.set(a.attackId,hits);}m={...m,objects:applyRobotObjectiveObjectBatch(m.objects,[...grouped].map(([id,hits])=>({id,hits})))};}
  if(m.data?.carrierId){const drop=dropped.find(d=>d.unitId===m.data!.carrierId);if(drop)m={...m,...(m.subobjectiveHistory?{subobjectiveHistory:{...m.subobjectiveHistory,dataDropped:true}}:{}),data:{...m.data,carrierId:null,cell:{...drop.position}}};}
  if(m.waveDueRound===null){
    if(m.missionNumber===3&&s.units.filter(u=>!allied(u)&&u.hp===0).length>=3)m={...m,waveDueRound:s.allied.round+1};
    if(m.missionNumber===4&&m.objects.objects.filter(o=>o.hp===0).length===1)m={...m,waveDueRound:s.allied.round+1,waveBranch:m.objects.objects.find(o=>o.hp>0)!.id};
    if([11,23,25].includes(m.missionNumber)&&m.objects.objects.some(o=>o.hp===0))m={...m,waveDueRound:s.allied.round+1};
    if([7,14,27,29].includes(m.missionNumber)&&m.data!.collectedRound!==null)m={...m,waveDueRound:m.data!.collectedRound!+1};
  }
  return{...next,objective:{kind:"early",state:outcome(m,s.allied.lostBySameRoundWipe,s.units.some(u=>u.id===(s.key.missionNumber===27?"archive-command-unit":s.key.missionNumber===22?"command-boss-final":s.key.missionNumber===16?"command-walker":"moving-commander")&&u.hp===0))}};
}
export function finishRobotEarlyRound(s:RobotBattleCoreState):RobotEarlyMissionState {
  if(s.objective.kind!=="early")throw new Error("Early mission required");
  let m=s.objective.state;if(m.result!=="ongoing"||m.objects.completedRound+1!==s.allied.round)throw new Error("Invalid early round boundary");
  const priorTransportIndex=m.objects.objects.find(o=>o.kind==="transport")?.routeIndex??0;
  m={...m,objects:advanceRobotObjectiveTransports(m.objects,s.allied.round,{walls:s.board.walls,occupied:[...s.units.filter(u=>u.hp>0).map(u=>u.position!),...(s.decoys??[]).map(d=>d.cell),...m.objects.objects.filter(o=>o.kind!=="transport"&&o.blocksMovement).flatMap(o=>o.cells)]})};
  if (m.missionNumber === 5 && m.subobjectiveHistory?.lastTransportGuardRound !== undefined) {
    const transport = m.objects.objects[0]!;
    const adjacentGuard = s.units.some(unit => unit.kind === "controlled" && unit.hp > 0 && unit.position &&
      transport.cells.some(cell => Math.max(Math.abs(cell.x - unit.position!.x), Math.abs(cell.y - unit.position!.y)) === 1));
    if (adjacentGuard) m = { ...m, subobjectiveHistory: { ...m.subobjectiveHistory, lastTransportGuardRound: s.allied.round } };
  }
  if(m.missionNumber===6 && m.subobjectiveHistory && s.units.some(u=>u.kind==="controlled"&&u.hp>0&&u.position&&same(u.position,robotCellToPosition("I5")))) m={...m,subobjectiveHistory:{...m.subobjectiveHistory,centralBaseOccupied:true}};
  if([6,13,20,23,26,28].includes(m.missionNumber)){const owners=robotEarlyGoalCells(s.key).map(cell=>{const u=s.units.find(u=>u.hp>0&&u.position&&same(cell,u.position));return u?allied(u)?"allied" as const:"enemy" as const:"neutral" as const;});m={...m,controlOwners:owners,controlStreak:owners.filter(o=>o==="allied").length>=2?m.controlStreak+1:0};}
  if([24,26,28].includes(m.missionNumber)){
    const bases=([26,28].includes(m.missionNumber)?robotEarlyGoalCells(s.key):[]).map((cell,i)=>{
      const unit=s.units.find(u=>u.kind==="controlled"&&u.hp>0&&u.position&&same(u.position,cell));
      return {cell:String(i),allied:m.controlOwners[i]==="allied",...(unit?{controlledId:unit.id}:{})};
    });
    const transport=m.objects.objects.find(o=>o.kind==="transport");
    const guardedIds=transport&&s.units.some(u=>u.kind==="controlled"&&u.hp>0&&u.position&&transport.cells.some(cell=>Math.max(Math.abs(cell.x-u.position!.x),Math.abs(cell.y-u.position!.y))===1))?[transport.id]:[];
    const roundEvent:RobotSubobjectiveEvent={kind:"round-end",round:s.allied.round,bases,guardedIds,transportAdvance:transport?transport.routeIndex-priorTransportIndex:0};
    m={...m,lateSubobjectiveEvents:[...(m.lateSubobjectiveEvents??[]),roundEvent]};
  }
  m=outcome(m,s.allied.lostBySameRoundWipe,s.units.some(u=>u.id===(s.key.missionNumber===27?"archive-command-unit":s.key.missionNumber===22?"command-boss-final":"moving-commander")&&u.hp===0));
  return m.result==="ongoing"&&s.allied.round===getRobotStagePlan(s.key).roundLimit?{...m,result:"lost",resultReason:"round-limit"}:m;
}
export function spawnRobotEarlyWave(s:RobotBattleCoreState,round:number,occupied:readonly RobotPosition[]) {
  if(s.objective.kind!=="early")throw new Error("Early wave required");
  let m=s.objective.state;const stage=getRobotStagePlan(s.key),spawned:{waveId:string;squadId:string;cells:readonly RobotPosition[]}[]=[],deferredWaveIds:string[]=[];
  for(const w of stage.reinforcements){const due=w.triggerType==="round-start"?w.triggerRound:m.waveDueRound;if(m.spawnedWaveIds.includes(w.id)||due===null||round<due)continue;const branch=w.spawnBranches.find(b=>b.survivingDepotId===m.waveBranch);const pads=(w.spawnBranches.length?branch?[...branch.memberCells,...branch.fallbackCells]:[]:[...w.initialCells,...w.fallbackCells]).map(robotCellToPosition);
    const cells=chooseRobotReinforcementCells(pads,[...occupied,...(s.decoys??[]).map(d=>d.cell),...s.board.walls,...m.objects.objects.filter(o=>o.blocksMovement).flatMap(o=>o.cells),...spawned.flatMap(w=>w.cells)]);
    if(!cells)deferredWaveIds.push(w.id);else{spawned.push({waveId:w.id,squadId:w.squad.id,cells});m={...m,spawnedWaveIds:[...m.spawnedWaveIds,w.id]};}
  }
  return{state:m,spawned,deferredWaveIds};
}
export function getRobotEarlyDataAction(s:RobotBattleCoreState,unitId:string,kind:"pickup"|"transmit"):string|null {
  const u=s.units.find(u=>u.id===unitId);
  if(s.objective.kind!=="early"||![7,14,21,24,27,29].includes(s.key.missionNumber)||!u||u.kind!=="controlled"||u.hp<=0||!u.position||!u.energy.turnOpen||u.energy.action||s.objective.state.data!.sent)return"データ操作は実行できません";
  const d=s.objective.state.data!;
  return kind==="pickup"?d.cell&&same(d.cell,u.position)&&u.carriedObjectiveId===null?null:"データのあるマスへ移動してください":d.carrierId===u.id&&same(u.position,robotCellToPosition(lateData[s.key.missionNumber]?.[1]??(s.key.missionNumber===21?"I12":"I13")))?null:`データ運搬機を${lateData[s.key.missionNumber]?.[1]??(s.key.missionNumber===21?"I12":"I13")}へ移動してください`;
}
/** Strict additive save codec; immutable mission definitions are always reconstructed. */
export function assertRobotEarlyMission(s:RobotBattleCoreState):void {
  if(s.objective.kind!=="early")return;
  const m=s.objective.state,c=createRobotEarlyMission(s.key),integer=(v:number,min=0)=>{if(!Number.isSafeInteger(v)||v<min)throw new Error("Invalid early objective integer");},unique=(v:readonly string[])=>{if(!Array.isArray(v)||new Set(v).size!==v.length||v.some(id=>typeof id!=="string"||!id))throw new Error("Invalid early objective IDs");};
  if(m.missionNumber!==s.key.missionNumber||s.allied.round>getRobotStagePlan(s.key).roundLimit||!["ongoing","won","lost"].includes(m.result))throw new Error("Invalid early mission identity/result");
  if(m.subobjectiveHistory){const h=m.subobjectiveHistory;
    if(typeof h.centralBaseOccupied!=="boolean"||typeof h.dataDropped!=="boolean"||!h.depotDamageSources||Object.keys(h.depotDamageSources).sort().join(",")!=="depot-left,depot-right")throw new Error("Invalid subobjective history");
    for(const ids of Object.values(h.depotDamageSources)){unique(ids);if(ids.some(id=>!s.units.some(u=>u.id===id&&u.kind==="controlled"))||m.missionNumber!==4&&ids.length)throw new Error("Invalid depot damage source");}
    if (h.preCrossDamageIds !== undefined) {
      unique(h.preCrossDamageIds);
      if (m.missionNumber !== 3 || h.preCrossDamageIds.some(id => !s.units.some(u => u.kind === "controlled" && u.id === id))) throw new Error("Invalid pre-crossing damage receipt");
    }
    if (h.depotFinalBlows !== undefined) {
      if (!h.depotFinalBlows || typeof h.depotFinalBlows !== "object" || Array.isArray(h.depotFinalBlows) || m.missionNumber !== 4) throw new Error("Invalid depot final blows");
      for (const [id, actor] of Object.entries(h.depotFinalBlows)) {
        if (!m.objects.objects.some(object => object.id === id && object.hp === 0) || !h.depotDamageSources[id]?.includes(actor)) throw new Error("Invalid depot final blow");
      }
    }
    if (h.lastTransportGuardRound !== undefined && (m.missionNumber !== 5 ||
      h.lastTransportGuardRound !== null && (!Number.isSafeInteger(h.lastTransportGuardRound) ||
      h.lastTransportGuardRound < 1 || h.lastTransportGuardRound > m.objects.completedRound))) {
      throw new Error("Invalid transport guard receipt");
    }
    if(h.centralBaseOccupied&&(m.missionNumber!==6||m.objects.completedRound<1)||h.dataDropped&&(![7,14,21,24,27,29].includes(m.missionNumber)||m.data?.collectedRound===null))throw new Error("Invalid subobjective event");
  }
  if(m.missionNumber===9){
    if(m.m09FormationHit===undefined||m.objects.objects.length||s.units.filter(u=>u.kind==="boss").length!==1||!s.units.some(u=>u.id==="moving-commander"&&u.kind==="boss"))throw new Error("Invalid M09 objective identity");
    const h=m.m09FormationHit;
    if(h!==null && (!(["line","delta"] as string[]).includes(h.technique)||!s.attackIds.includes(h.attackId)||
      !s.actionIds.some(id=>h.attackId===id+":formation"||h.attackId===id+":delta")||
      !s.units.some(u=>u.id===h.sourceId&&allied(u))||
      !s.units.some(u=>u.id===h.targetId&&!allied(u))||
      !Number.isSafeInteger(h.hpRemoved)||h.hpRemoved<1||h.hpRemoved>s.units.find(u=>u.id===h.targetId)!.maxHp))throw new Error("Invalid M09 formation damage receipt");
  }else if(m.m09FormationHit!==undefined)throw new Error("Unexpected M09 formation receipt");
  integer(m.objects.completedRound);unique(m.objects.appliedAttackIds);unique(m.arrivedIds);unique(m.spawnedWaveIds);integer(m.controlStreak);
  if(m.objects.objects.length!==c.objects.objects.length||m.objects.appliedAttackIds.some(id=>!s.attackIds.includes(id)))throw new Error("Invalid early object attack ledger");
  for(const expected of c.objects.objects){const o=m.objects.objects.find(o=>o.id===expected.id);if(!o)throw new Error("Missing mission object");integer(o.hp);integer(o.routeIndex);if(o.hp>expected.maxHp||JSON.stringify({...o,hp:expected.hp,routeIndex:0,cells:expected.cells})!==JSON.stringify(expected)||o.routeIndex>m.objects.completedRound||o.routeIndex>=Math.max(1,o.route.length)||JSON.stringify(o.cells)!==JSON.stringify(o.kind==="transport"?[o.route[o.routeIndex]]:expected.cells))throw new Error("Mission object differs from adopted definition");}
  if(m.arrivedIds.some(id=>!s.units.some(u=>u.id===id&&u.kind==="controlled"))||![3,10,17,25].includes(m.missionNumber)&&m.arrivedIds.length||m.controlOwners.length!==c.controlOwners.length||m.controlOwners.some(o=>!["neutral","allied","enemy"].includes(o))||![6,13,20,23,26,28].includes(m.missionNumber)&&m.controlStreak||m.controlStreak>m.objects.completedRound)throw new Error("Invalid arrival/control ledger");
  if(m.waveDueRound!==null){integer(m.waveDueRound,2);if(m.waveDueRound>s.allied.round+1||![3,4,7,10,11,14,23,25,27,29].includes(m.missionNumber))throw new Error("Invalid event wave round");}
  if(m.waveBranch!==null&&(m.missionNumber!==4||!c.objects.objects.some(o=>o.id===m.waveBranch))||m.missionNumber===4&&(m.waveDueRound===null)!==(m.waveBranch===null))throw new Error("Invalid conditional wave branch");
  for(const w of getRobotStagePlan(s.key).reinforcements){
    const has=m.spawnedWaveIds.includes(w.id),actor=s.actors.find(a=>a.id===w.squad.id),due=w.triggerType==="round-start"?w.triggerRound:m.waveDueRound;
    // M06 wave moved from R5 to R6. A pre-adjustment R5 save may already
    // contain its legitimate squad; retain its receipt without spawning twice.
    const legacyM06R5=has&&m.missionNumber===6&&w.id==="r5-flanking-ranged"&&s.allied.round===5&&due===6;
    if(has!==Boolean(actor)||has&&(due===null||s.allied.round<due&&!legacyM06R5))throw new Error("Invalid early wave receipt");
  }if(m.spawnedWaveIds.some(id=>!getRobotStagePlan(s.key).reinforcements.some(w=>w.id===id)))throw new Error("Unknown early wave");
  if(m.missionNumber===3 && (s.units.filter(u=>!allied(u)&&u.hp===0).length>=3)!==(m.waveDueRound!==null))throw new Error("M03 pursuit trigger disagrees with defeats");
  if([13,20,23].includes(m.missionNumber)){
    if((m.missionNumber===23?m.objects.objects.length!==2:m.objects.objects.length!==0)||m.controlOwners.length!==3||
      m.waveDueRound!==null||m.waveBranch!==null||
      (m.result==="won" && (m.controlStreak<2||m.objects.completedRound!==s.allied.round)))
      throw new Error("Invalid M13 base control record");
  }
  if(m.missionNumber===14){
    const receipt=m.m14PursuerKill;
    if(receipt===undefined||m.objects.objects.length!==0||!m.data)throw new Error("Invalid M14 objective ledger");
    if(receipt!==null&&(
      !s.units.some(u=>u.id===receipt.sourceId&&u.kind==="controlled")||
      !s.units.some(u=>u.id===receipt.targetId&&u.squadId==="return-raiders"&&u.hp===0)||
      !s.attackIds.includes(receipt.attackId)||m.data.collectedRound===null||
      !m.spawnedWaveIds.includes("data-pursuers")))
      throw new Error("Invalid M14 pursuer kill receipt");
    if((m.data.collectedRound!==null)!==(m.waveDueRound!==null))
      throw new Error("Invalid M14 pursuit schedule");
  }else if(m.m14PursuerKill!==undefined)throw new Error("Unexpected M14 kill receipt");
  if([12,19].includes(m.missionNumber)){
    if(m.objects.objects.length!==1||m.objects.objects[0]!.kind!=="transport"||
      m.objects.objects[0]!.route.length!==(m.missionNumber===19?10:9)||m.objects.objects[0]!.routeIndex>(m.missionNumber===19?9:8)||
      m.waveDueRound!==null||m.waveBranch!==null||
      m.objects.objects[0]!.routeIndex>m.objects.completedRound)
      throw new Error("Invalid M12 convoy route or scheduled reinforcement");
  }
  if(m.missionNumber===11){
    const final=m.m11FinalBlows;
    if(!final||typeof final!=="object"||Array.isArray(final)||m.objects.objects.length!==2||
      m.objects.objects.some(o=>o.kind!=="depot")||
      Object.keys(final).some(id=>!m.objects.objects.some(o=>o.id===id&&o.hp===0))||
      m.objects.objects.some(o=>(o.hp===0)!==Object.hasOwn(final,o.id)))throw new Error("Invalid M11 depot final-blow ledger");
    for(const {sourceId,attackId} of Object.values(final)){
      if(!s.units.some(u=>u.id===sourceId&&allied(u))||!s.attackIds.includes(attackId)||
        !m.objects.appliedAttackIds.includes(attackId))throw new Error("Invalid M11 depot final-blow receipt");
    }
    if((m.objects.objects.some(o=>o.hp===0))!==(m.waveDueRound!==null))throw new Error("M11 counterattack trigger differs from depot HP");
  }else if(m.m11FinalBlows!==undefined)throw new Error("Unexpected M11 final-blow ledger");
  if(m.missionNumber===10){
    if(m.m10DefeatedIds===undefined||m.m09FormationHit!==undefined||m.objects.objects.length!==0)throw new Error("M10 objective history missing");
    unique(m.m10DefeatedIds);
    if(m.m10DefeatedIds.some(id=>!s.units.some(u=>u.id===id&&u.kind==="controlled"))||
      s.allied.waiting.some(w=>s.units.some(u=>u.id===w.unitId&&u.kind==="controlled")&&!m.m10DefeatedIds!.includes(w.unitId))||
      s.allied.controlledDefeatedThisRound.some(id=>!m.m10DefeatedIds!.includes(id)))throw new Error("M10 defeat ledger differs from lifecycle");
    if((m.arrivedIds.length!==0)!==(m.waveDueRound!==null))throw new Error("M10 first-crossing reinforcement trigger invalid");
  }else if(m.m10DefeatedIds!==undefined)throw new Error("Unexpected M10 defeat ledger");
  if(m.missionNumber===4 && (m.objects.objects.every(o=>o.hp>0)&&m.waveDueRound!==null || m.result!=="won"&&m.waveBranch!==null&&!m.objects.objects.some(o=>o.id===m.waveBranch&&o.hp>0)))throw new Error("M04 branch does not identify the surviving depot");
  if([6,13,20,26,28].includes(m.missionNumber) && (m.controlOwners.filter(o=>o==="allied").length>=2)!==(m.controlStreak>0))throw new Error("Base owners disagree with capture streak");
  const carriers=s.units.filter(u=>u.carriedObjectiveId!==null);
  if(![7,14,21,24,27,29].includes(m.missionNumber)){if(m.data!==null||carriers.length)throw new Error("Unexpected carried objective");}
  else{const d=m.data;if(!d||typeof d.sent!=="boolean"||carriers.some(u=>u.kind!=="controlled"||u.hp===0||u.carriedObjectiveId!==(robotMissionDataId(m.missionNumber)))||carriers.length!==(d.carrierId?1:0)||d.carrierId&&carriers[0]?.id!==d.carrierId||d.sent&&(d.cell!==null||d.carrierId!==null)||!d.sent&&(d.cell===null)===(d.carrierId===null))throw new Error("Invalid M07 data state");if(d.collectedRound!==null){integer(d.collectedRound,1);if(d.collectedRound>s.allied.round||m.waveDueRound!==([21,24].includes(m.missionNumber)?null:d.collectedRound+1))throw new Error("Invalid M07 pickup/wave time");}else if(d.sent||d.carrierId||!d.cell||!same(d.cell,robotCellToPosition(lateData[m.missionNumber]?.[0]??(m.missionNumber===21?"I2":"J3")))||m.waveDueRound!==null)throw new Error("Uncollected M07 data changed");if(d.cell&&(d.cell.x<0||d.cell.y<0||d.cell.x>=s.board.width||d.cell.y>=s.board.height||!Number.isSafeInteger(d.cell.x)||!Number.isSafeInteger(d.cell.y)))throw new Error("Invalid data cell");}
  const roundEnd=["round-limit","transport-arrived","bases-controlled","facility-survived","convoy-and-bases-complete","facility-and-bases-complete"].includes(m.resultReason??"");if(m.objects.completedRound!==s.allied.round-(roundEnd?0:1))throw new Error("Invalid early completed-round receipt");
  if(roundEnd && s.actors.some(a=>!s.turn.actedActorIds.includes(a.id)&&a.unitIds.some(id=>s.units.some(u=>u.id===id&&u.hp>0&&u.position))))throw new Error("Round-end objective resolved before every actor completed");
  const evaluated=outcome({...m,result:"ongoing",resultReason:null},s.allied.lostBySameRoundWipe,s.units.some(u=>u.id===(m.missionNumber===27?"archive-command-unit":m.missionNumber===22?"command-boss-final":m.missionNumber===16?"command-walker":"moving-commander")&&u.hp===0));
  if(m.result==="ongoing"&&(m.resultReason!==null||evaluated.result!=="ongoing")||m.result==="won"&&(evaluated.result!=="won"||evaluated.resultReason!==m.resultReason)||m.result==="lost"&&!(evaluated.result==="lost"&&evaluated.resultReason===m.resultReason||m.resultReason==="round-limit"&&evaluated.result==="ongoing"&&s.allied.round===getRobotStagePlan(s.key).roundLimit))throw new Error("Early outcome disagrees with Core");
}

export function robotHasExtracted(s: RobotBattleCoreState, unitId: string): boolean {
  return s.objective.kind === "early" && s.objective.state.arrivedIds.includes(unitId);
}

export function recordRobotEarlyAdvance(_before: RobotBattleCoreState, after: RobotBattleCoreState, unitId: string): RobotBattleCoreState {
  const landing = after.units.find(u => u.id === unitId)?.position;
  return landing ? recordRobotEarlyEntry(after, unitId, landing) : after;
}
/** Already-adopted teleport exception: the swap's action owns immediate positional data effects. */
export function applyRobotEarlyTeleportData(s:RobotBattleCoreState,swappedIds:readonly string[]):RobotBattleCoreState {
  if(s.objective.kind!=="early"||![7,14].includes(s.key.missionNumber)||s.objective.state.data!.sent)return s;
  let next=s,data=s.objective.state.data!;
  for(const id of swappedIds){const u=next.units.find(u=>u.id===id)!;if(u.kind!=="controlled"||u.hp<=0||!u.position)continue;
    if(data.cell&&same(data.cell,u.position)&&u.carriedObjectiveId===null){data={...data,cell:null,carrierId:id,collectedRound:data.collectedRound??s.allied.round};next={...next,units:next.units.map(v=>v.id===id?{...v,carriedObjectiveId:(s.key.missionNumber===14?ROBOT_M14_DATA_ID:ROBOT_M07_DATA_ID)}:v)};}
    if(data.carrierId===id&&same(u.position,robotCellToPosition("I13"))){data={...data,cell:null,carrierId:null,sent:true};next={...next,units:next.units.map(v=>v.id===id?{...v,carriedObjectiveId:null}:v)};}
  }
  return reconcileRobotEarlyMission({...next,objective:{kind:"early",state:{...s.objective.state,data}}});
}
