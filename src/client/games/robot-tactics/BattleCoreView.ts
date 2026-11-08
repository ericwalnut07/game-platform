import { robotEarlyGoalCells } from "../../../games/robot-tactics/earlyMissions";
import { robotFacilitySpriteForStructure } from "./BattleFacilityArt";
import { getRobotHazardCells, getRobotHazardMovePenalty } from "../../../games/robot-tactics/hazards";
import { getRobotStagePlan } from "../../../games/robot-tactics/stageCatalog";
import type { RobotVfxCue, RobotVfxId } from "./RobotVfx";
import { robotCellToPosition } from "../../../games/robot-tactics/movement";
import basicParts from "../../../../docs/design/robot-tactics/basic-parts.json";
import { assertRobotBattleCore, getRobotBattleCommandBonus, getRobotBattleFacilities, getRobotBattleMovementShape, getRobotBattleUnit, robotBattleIsAlly, robotBattleTurnId, type RobotBattleCoreState } from "../../../games/robot-tactics/battleState";
import { resolveRobotBasicPart } from "../../../games/robot-tactics/equipment";
import { getRobotBasicActionModifiers } from "../../../games/robot-tactics/equipmentEffects";
import { assertRobotBattleViewModel, type RobotBattleActorView, type RobotBattleViewModel } from "./BattleViewModel";
import { projectRobotBattleActionLog } from "./BattleActionLog";

/** State observation + caller's trusted legal-action projection. Does not invent
 * initiative order, enemy plans, attack range, statuses or action candidates.
 */
export function projectRobotBattleCore(s: RobotBattleCoreState, checkpoint: RobotBattleViewModel["checkpoint"], actions: {
  readonly previewActorIds?: readonly string[];
  readonly commands?: RobotBattleViewModel["commands"];
  readonly choices?: RobotBattleViewModel["choices"];
  readonly blocked?: RobotBattleViewModel["blocked"];
} = {}): RobotBattleViewModel {
  assertRobotBattleCore(s);
  if (checkpoint.battleId !== s.id) throw new Error("Core/outer checkpoint identity mismatch");
  const ids = s.turn.actorId === null ? [] : [s.turn.actorId, ...(actions.previewActorIds ?? [])];
  if (new Set(ids).size !== ids.length || ids.some(id => s.turn.actedActorIds.includes(id))) throw new Error("Duplicate/completed actor in initiative preview");
  const queue: RobotBattleActorView[] = ids.map(id => {
    const actor = s.actors.find(a => a.id === id); if (!actor) throw new Error("Unknown projected actor");
    const members = actor.unitIds.map(id => getRobotBattleUnit(s, id)).filter(u => u.hp > 0);
    if (!members.length) throw new Error("Dead actor cannot appear in initiative preview");
    const first = members[0]!, kind = robotBattleIsAlly(first) ? first.kind as "controlled" | "friendly-ai" : "enemy";
    return { id: actor.id, name: members.length > 1 ? actor.id : first.name, kind, unitIds: members.map(u => u.id) };
  });
  const pulses = [...new Set(s.latest?.damage.map(e => e.attackId) ?? [])];
  const explosions = s.latest?.fuseExplosions ?? [];
  explosions.forEach((e, i) => {
    if (pulses.includes(e.attackId)) return;
    const following = explosions.slice(i + 1).find(n => pulses.includes(n.attackId)), preceding = explosions.slice(0, i).reverse().find(n => pulses.includes(n.attackId));
    const index = following ? pulses.indexOf(following.attackId) : preceding ? pulses.indexOf(preceding.attackId) + 1 : pulses.length;
    pulses.splice(index, 0, e.attackId);
  });
  const bombViews = new Map(s.units.flatMap(u => {
    const bombs = s.fuses?.bombs.filter(b => b.state === "armed" && b.targetId === u.id) ?? [];
    return bombs.length ? [[u.id, { count: bombs.length, turnsUntilEnd: Math.max(0, Math.min(...bombs.map(b => b.dueOwnTurn)) - u.energy.ownTurn) }] as const] : [];
  }));
  const visualCues: RobotVfxCue[] = (s.latest?.supportCues??[]).map((c,i)=>({id:s.latest!.id+":support:"+i,...c}));
  s.latest?.energyRecoveries?.forEach(e => visualCues.push({ id: e.id, effect: "heal", cell: e.cell }));
  s.latest?.blastEmptyCenters?.forEach((cell, i) => visualCues.push({ id: `${s.latest!.id}:empty-blast:${i}`, effect: "blast", cell }));
  for (const unit of s.units) {
    const boss = unit.boss, mission = boss?.plan.missionNumber;
    const effect = mission === 2 ? "attack_up" : mission === 16 ? "defense_order" : mission === 22 ? "artillery_order" : mission === 30 ? "supreme_order" : null;
    if (boss && effect && boss.lastSkillOwnTurn !== null && unit.hp > 0 && unit.position) visualCues.push({ id: `command:${unit.id}:${boss.lastSkillOwnTurn}`, effect, cell: unit.position });
  }
  if (s.resupplyField) visualCues.push({ id:s.resupplyField.id, effect:"heal",cell:s.resupplyField.cell });
  if (s.objective.kind === "m30" || s.objective.kind==="early"&&[7,14].includes(s.key.missionNumber)) {
    const data = s.objective.state.data!, carrier = s.units.find(u => u.id === data.carrierId);
    if (carrier?.position) visualCues.push({ id: "data:pickup:" + carrier.id, effect: "data_pickup", cell: carrier.position });
    if (data.sent) visualCues.push({ id: "data:sent", effect: "data_transmit", cell: robotCellToPosition(s.objective.kind==="m30"?"I14":"I13") });
  }
  const visualStatuses = (id: string): RobotVfxId[] => {
    const unit = getRobotBattleUnit(s, id), bonus = getRobotBattleCommandBonus(s, id, null), effects: RobotVfxId[] = [];
    if (unit.burning) effects.push("dot");
    if (unit.shielded || unit.defended || unit.formationDefense?.length || unit.stationaryDefense || unit.projectedDefense || bonus.defense > 0) effects.push("defense_up");
    if (bonus.melee > 0 || bonus.ranged > 0) effects.push("attack_up");
    if (unit.weakpoint) effects.push("defense_down");
    if (unit.tacticalMark) effects.push("defense_down");
    if (unit.weaponDebuffs?.some(d => d.stat === "def" && d.delta < 0)) effects.push("defense_down");
    return effects;
  };
  let objectiveText:string|undefined;
  const objectiveMarkers: NonNullable<RobotBattleViewModel["objectiveMarkers"]>[number][]=[];
  // M30 already defines both coordinates. Expose visual markers only, without
  // adding any Core objects, collision cells, actions or saved information.
  if (s.objective.kind === "m30") {
    if (s.objective.state.data.cell) objectiveMarkers.push({
      id: "m30-data-floor", cell: s.objective.state.data.cell,
      label: "指令データ取得", status: "target",
    });
    objectiveMarkers.push({
      id: "m30-data-upload", cell: robotCellToPosition("I14"),
      label: "指令データ送信", status: "target",
    });
  }
  if(s.objective.kind==="early"){
    const m=s.objective.state,goals=robotEarlyGoalCells(s.key),prefix=`M${String(s.key.missionNumber).padStart(2,"0")} 目標：`;
    if(s.key.missionNumber===3){objectiveText=prefix+`R7までに異なる2機が突破（${m.arrivedIds.length}/2）`;goals.forEach((cell,i)=>objectiveMarkers.push({id:"breakthrough:"+i,cell,label:"突破地点",status:"target"}));}
    if(s.key.missionNumber===10){const first=m.arrivedIds[0],defeated=first?m.m10DefeatedIds?.includes(first):false;
      const wave=m.spawnedWaveIds.includes("first-crossing-response")?"増援出現済":m.waveDueRound!==null?"増援 R"+m.waveDueRound:"初突破後に増援";
      objectiveText=prefix+`R8までに異なる自機2機が突破（${m.arrivedIds.length}/2・${wave}${first?"・先着 "+first+(defeated?" 撃破履歴あり":" 撃破履歴なし"):""}）`;
      goals.forEach((cell,i)=>objectiveMarkers.push({id:"m10-breakthrough:"+i,cell,label:"突破ライン（自機のみ有効）",status:"target"}));}
    if(s.key.missionNumber===4)objectiveText=prefix+`R8までに補給拠点を両方破壊（${m.objects.objects.filter(o=>o.hp===0).length}/2）`;
    if(s.key.missionNumber===11){const depots=m.objects.objects;
      const wave=m.spawnedWaveIds.includes("depot-retaliation")?"反撃隊出現済":m.waveDueRound===null?"施設破壊後に反撃隊":`反撃隊R${m.waveDueRound}から出現`;
      const blows=m.m11FinalBlows??{};
      objectiveText=prefix+`R9までに左右補給施設を破壊（${depots.filter(d=>d.hp===0).length}/2・西 ${depots.find(d=>d.id==="depot-west")!.hp}HP／東 ${depots.find(d=>d.id==="depot-east")!.hp}HP・${wave}）`;
      depots.forEach(d=>d.cells.forEach((cell,i)=>objectiveMarkers.push({id:"m11-depot:"+d.id+":"+i,cell,label:(d.id==="depot-west"?"西":"東")+"補給施設 HP"+d.hp+"/"+d.maxHp+(blows[d.id]?"／撃破 "+blows[d.id]!.sourceId:""),status:"target"})));
    }
    if(s.key.missionNumber===5){const o=m.objects.objects[0]!;objectiveText=prefix+`R8まで輸送護衛（HP ${o.hp}/${o.maxHp}・経路 ${o.routeIndex}/7）`;objectiveMarkers.push({id:"convoy-goal",cell:goals[0]!,label:"輸送先",status:"target"});}
    if(s.key.missionNumber===12){const convoy=m.objects.objects[0]!,wave=m.spawnedWaveIds.includes("round5-crossfire")?"R5後方射撃隊出現済":s.allied.round>=5?"後方射撃隊配置待ち":"R5後方射撃隊が出現予定";
      objectiveText=prefix+`R10までJ5へ輸送車を護衛（HP ${convoy.hp}/${convoy.maxHp}・進行 ${convoy.routeIndex}/8・${wave}）`;
      objectiveMarkers.push({id:"m12-convoy-goal",cell:goals[0]!,label:"輸送車到達目標 J5",status:"target"});
    }
    if([6,13].includes(s.key.missionNumber)){
      const wave=s.key.missionNumber===13?(m.spawnedWaveIds.includes("round6-recapture")?"・R6奪還隊出現済":s.allied.round>=6?"・R6奪還隊配置待ち":"・R6に奪還隊出現予定"):"";
      objectiveText=prefix+`R${getRobotStagePlan(s.key).roundLimit}まで2拠点を2R連続制圧（${m.controlStreak}/2R${wave}）`;
      goals.forEach((cell,i)=>objectiveMarkers.push({id:"base:"+i,cell,label:"拠点（直近ラウンド末）："+({allied:"味方",enemy:"敵",neutral:"中立"} as const)[m.controlOwners[i]!],status:m.controlOwners[i]!}));
    }
    if(s.key.missionNumber===8){const facility=m.objects.objects[0]!;objectiveText=prefix+`R7終了まで通信基地を防衛（HP ${facility.hp}/${facility.maxHp}）`;}
    if(s.key.missionNumber===9){const boss=getRobotBattleUnit(s,"moving-commander");objectiveText=prefix+`R9終了までに機動指揮機を撃破（HP ${boss.hp}/${boss.maxHp}・護衛撃破不要）`;if(boss.hp>0&&boss.position)objectiveMarkers.push({id:"commander-target",cell:boss.position,label:"撃破対象：機動指揮機",status:"target"});}
    if([7,14].includes(s.key.missionNumber)){const d=m.data!,carrier=s.units.find(u=>u.id===d.carrierId);const wave=s.key.missionNumber===14?(m.spawnedWaveIds.includes("data-pursuers")?"・追撃隊出現済":m.waveDueRound!==null?"・追撃隊R"+m.waveDueRound+"以降":"・取得後に追撃隊"):"";
      const pursuer=s.key.missionNumber===14?(m.m14PursuerKill?"・自機の追撃隊撃破記録あり":"・追撃隊撃破記録なし"):"";
      objectiveText=prefix+`R${getRobotStagePlan(s.key).roundLimit}までJ3で取得→I13で送信（${d.sent?"送信済":carrier?carrier.name+"が運搬中":d.collectedRound?"データ落下・再回収可":"未取得"}・重装甲撃破不要${wave}${pursuer}）`;if(d.cell)objectiveMarkers.push({id:"data-floor",cell:d.cell,label:d.collectedRound?"落下データ":"データ取得",status:"target"});objectiveMarkers.push({id:"data-upload",cell:goals[1]!,label:"データ送信",status:"target"});}
  }
  const damage = s.latest?.damage ?? [];
  const model: RobotBattleViewModel = {
    checkpoint, turnId: robotBattleTurnId(s), round: s.allied.round, roundLimit: getRobotStagePlan(s.key).roundLimit,
    ...(s.objective.kind==="m02"?{objectiveText:`M02 目標：R8までに指揮機を撃破（HP ${getRobotBattleUnit(s,"commander").hp}/${getRobotBattleUnit(s,"commander").maxHp}・護衛撃破不要）`}:{}),
    ...(objectiveText?{objectiveText}:{}),...(objectiveMarkers.length?{objectiveMarkers}:{}),
    board: s.board, structures: getRobotBattleFacilities(s).map(o => ({ id: o.id, ...([4,11].includes(s.key.missionNumber)?{hostile:true}:{}), name:[4,11].includes(s.key.missionNumber)?o.id==="depot-left"||o.id==="depot-west"?"左補給拠点":"右補給拠点":[5,12].includes(s.key.missionNumber)?"輸送車":"防衛施設", cells: o.cells, hp: o.hp, maxHp: o.maxHp, def: o.def, ...(robotFacilitySpriteForStructure(o.id, s.key.missionNumber) ? { sprite: robotFacilitySpriteForStructure(o.id, s.key.missionNumber)! } : {}) })).concat((s.decoys??[]).map(d=>({id:d.id,name:"戦術デコイ",cells:[d.cell],hp:d.hp,maxHp:60,def:60}))),
    ...((s.resupplyField||s.hazards?.zones.length)?{supportFields:[...(s.resupplyField?[{id:s.resupplyField.id,label:`補給 EN+12・R${s.resupplyField.expiresRound}終了まで`,cells:Array.from({length:25},(_,i)=>({x:s.resupplyField!.cell.x+i%5-2,y:s.resupplyField!.cell.y+Math.floor(i/5)-2})).filter(c=>c.x>=0&&c.y>=0&&c.x<s.board.width&&c.y<s.board.height)}]:[]),...(s.hazards?.zones??[]).map(z=>({id:z.id,kind:z.kind==="proximity-mine"?"mine" as const:z.kind==="movement-interference-field"?"slow" as const:"fire" as const,label:`${z.kind==="proximity-mine"?"感応地雷":z.kind==="movement-interference-field"?"進路妨害 MOV−1":"残留爆炎 10ダメージ/手番"}・R${z.expiresRound}終了まで`,cells:getRobotHazardCells(s,z)}))]}:{}),
    units: s.units.filter(u => u.hp > 0 && u.position !== null).map(u => ({ id: u.id, name: u.name, kind: robotBattleIsAlly(u) ? u.kind as "controlled" | "friendly-ai" : "enemy", cell: u.position!, ...(u.movement ? { movement: getRobotBattleMovementShape(u, s)!, extraMoveDistance: getRobotBasicActionModifiers(u.parts.map(p => resolveRobotBasicPart(p.partId, p.level))).extraMoveDistance } : {}), hp: u.hp, maxHp: u.maxHp, en: u.energy.en, maxEn: u.energy.maxEn, ...(u.kind === "light" ? { hasEnergyResource: false } : {}), visualStatuses: visualStatuses(u.id), ...((u.reactionsSuppressedUntilOwnTurn!==undefined || u.carriedObjectiveId!==null || u.mineSlowUntilOwnTurn !== undefined || getRobotHazardMovePenalty(s,u)>0 || u.rootedUntilOwnTurn !== undefined || u.energy.lockedUntilOwnTurn !== undefined || u.tacticalMark || u.projectedDefense || u.weakpoint) ? { combatNotes: [...(u.reactionsSuppressedUntilOwnTurn!==undefined?["反応攻撃抑制：次の自身手番終了まで"]:[]),...(u.carriedObjectiveId!==null?["データ運搬中"]:[]),...(u.mineSlowUntilOwnTurn!==undefined?["地雷MOV−1：次の自身手番終了まで"]:[]),...(getRobotHazardMovePenalty(s,u)?["進路妨害：範囲内MOV−1（同種非加算）"]:[]),...(u.tacticalMark?["戦術標定：次の味方有ダメージ1hit×1.7（付与者の次手番開始まで）"]:[]),...(u.projectedDefense?["防護投射：被ダメージ×0.6（付与者の次手番開始まで）"]:[]),...(u.weakpoint?[`弱点照準：DEF−${u.weakpoint.amount}（付与者の次手番開始まで）`]:[]),...(u.rootedUntilOwnTurn !== undefined ? [`${u.energy.turnOpen && u.energy.ownTurn >= u.rootedUntilOwnTurn ? "この" : "次の"}自身手番終了まで通常移動不可`] : []), ...(u.energy.lockedUntilOwnTurn !== undefined ? [`${u.energy.turnOpen && u.energy.ownTurn >= u.energy.lockedUntilOwnTurn ? "この" : "次の"}自身手番終了までEN消費行動不可`] : [])] } : {}), ...(bombViews.has(u.id) ? { bombs: bombViews.get(u.id)! } : {}), ...(u.shielded ? { shielded: true } : {}), ...(u.defended ? { defended: true } : {}), weapons: u.parts.filter(p => resolveRobotBasicPart(p.partId, p.level).slot === "weapon").map(p => ({ name: basicParts.parts.find(b => b.id === p.partId)!.name, level: p.level })) })),
    queue, commands: actions.commands ?? [], choices: actions.choices ?? [], blocked: actions.blocked ?? [],
    visualCues,
    latestLog: projectRobotBattleActionLog(s),
    latestSummary: (s.latest?.summary ?? "戦闘開始")+(s.hazards?.zones.length?`／設置効果 ${s.hazards.zones.length}個（R${Math.min(...s.hazards.zones.map(z=>z.expiresRound))}末まで）`:"")+(s.resupplyField?`／補給フィールド：R${s.resupplyField.expiresRound}終了まで`:""),
    latestAction: s.latest ? { id: s.latest.id, hits: damage.flatMap((event, eventIndex) => event.cells.map((cell, i) => {
      const target = s.units.find(u => u.id === event.targetId), facility = getRobotBattleFacilities(s).find(f => f.id === event.targetId);
      const final = !damage.slice(eventIndex + 1).some(e => e.targetId === event.targetId && e.damage !== null);
      const decoy=s.latest?.decoyTargets?.find(d=>d.id===event.targetId);
      const destroyed = i === 0 && event.damage !== null && final && (target?.hp === 0 || facility?.hp === 0 || decoy?.hp===0);
      return { cell, kind: event.effectKind, damage: i === 0 ? event.damage : null, pulse: pulses.indexOf(event.attackId), impact: target?.kind === "light" ? "light" as const : "heavy" as const, ...(destroyed ? { destroyed: target?.kind === "light" ? "small" as const : "large" as const } : {}) };
    })).concat(explosions.filter(e => !damage.some(d => d.attackId === e.attackId && d.cells.some(c => c.x === e.cell.x && c.y === e.cell.y))).map(e => ({ cell: e.cell, kind: "special:delayed-fuse" as const, damage: null, pulse: pulses.indexOf(e.attackId), impact: "light" as const, presentationOnly: true as const }))), ...(s.latest.areaCells ? { areaCells: s.latest.areaCells } : {}) } : null,
    ai: { ...s.ai, ...(s.units.some(u => u.kind === "controlled" && u.addons?.some(a => a.partId === "friendly-ai-formation-enabler")) ? { formationUnlocked: true } : {}) }
  };
  assertRobotBattleViewModel(model); return model;
}
