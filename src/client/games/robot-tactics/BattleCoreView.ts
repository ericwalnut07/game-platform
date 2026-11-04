import { getRobotStagePlan } from "../../../games/robot-tactics/stageCatalog";
import type { RobotVfxCue, RobotVfxId } from "./RobotVfx";
import { robotCellToPosition } from "../../../games/robot-tactics/movement";
import basicParts from "../../../../docs/design/robot-tactics/basic-parts.json";
import { assertRobotBattleCore, getRobotBattleCommandBonus, getRobotBattleFacilities, getRobotBattleUnit, robotBattleIsAlly, robotBattleTurnId, type RobotBattleCoreState } from "../../../games/robot-tactics/battleState";
import { resolveRobotBasicPart } from "../../../games/robot-tactics/equipment";
import { assertRobotBattleViewModel, type RobotBattleActorView, type RobotBattleViewModel } from "./BattleViewModel";

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
    const effect = mission === 16 ? "defense_order" : mission === 22 ? "artillery_order" : mission === 30 ? "supreme_order" : null;
    if (boss && effect && boss.lastSkillOwnTurn !== null && unit.hp > 0 && unit.position) visualCues.push({ id: `command:${unit.id}:${boss.lastSkillOwnTurn}`, effect, cell: unit.position });
  }
  if (s.resupplyField) visualCues.push({ id:s.resupplyField.id, effect:"heal",cell:s.resupplyField.cell });
  if (s.objective.kind === "m30") {
    const data = s.objective.state.data, carrier = s.units.find(u => u.id === data.carrierId);
    if (carrier?.position) visualCues.push({ id: "data:pickup:" + carrier.id, effect: "data_pickup", cell: carrier.position });
    if (data.sent) visualCues.push({ id: "data:sent", effect: "data_transmit", cell: robotCellToPosition("I14") });
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
  const damage = s.latest?.damage ?? [];
  const model: RobotBattleViewModel = {
    checkpoint, turnId: robotBattleTurnId(s), round: s.allied.round, roundLimit: getRobotStagePlan(s.key).roundLimit,
    board: s.board, structures: getRobotBattleFacilities(s).map(o => ({ id: o.id, name: "防衛施設", cells: o.cells, hp: o.hp, maxHp: o.maxHp, def: o.def })).concat((s.decoys??[]).map(d=>({id:d.id,name:"戦術デコイ",cells:[d.cell],hp:d.hp,maxHp:60,def:60}))),
    ...(s.resupplyField?{supportFields:[{id:s.resupplyField.id,label:`補給 EN+12・R${s.resupplyField.expiresRound}終了まで`,cells:Array.from({length:25},(_,i)=>({x:s.resupplyField!.cell.x+i%5-2,y:s.resupplyField!.cell.y+Math.floor(i/5)-2})).filter(c=>c.x>=0&&c.y>=0&&c.x<s.board.width&&c.y<s.board.height)}]}:{}),
    units: s.units.filter(u => u.hp > 0 && u.position !== null).map(u => ({ id: u.id, name: u.name, kind: robotBattleIsAlly(u) ? u.kind as "controlled" | "friendly-ai" : "enemy", cell: u.position!, hp: u.hp, maxHp: u.maxHp, en: u.energy.en, maxEn: u.energy.maxEn, ...(u.kind === "light" ? { hasEnergyResource: false } : {}), visualStatuses: visualStatuses(u.id), ...((u.rootedUntilOwnTurn !== undefined || u.energy.lockedUntilOwnTurn !== undefined || u.tacticalMark || u.projectedDefense || u.weakpoint) ? { combatNotes: [...(u.tacticalMark?["戦術標定：次の味方有ダメージ1hit×1.7（付与者の次手番開始まで）"]:[]),...(u.projectedDefense?["防護投射：被ダメージ×0.6（付与者の次手番開始まで）"]:[]),...(u.weakpoint?[`弱点照準：DEF−${u.weakpoint.amount}（付与者の次手番開始まで）`]:[]),...(u.rootedUntilOwnTurn !== undefined ? [`${u.energy.turnOpen && u.energy.ownTurn >= u.rootedUntilOwnTurn ? "この" : "次の"}自身手番終了まで通常移動不可`] : []), ...(u.energy.lockedUntilOwnTurn !== undefined ? [`${u.energy.turnOpen && u.energy.ownTurn >= u.energy.lockedUntilOwnTurn ? "この" : "次の"}自身手番終了までEN消費行動不可`] : [])] } : {}), ...(bombViews.has(u.id) ? { bombs: bombViews.get(u.id)! } : {}), ...(u.shielded ? { shielded: true } : {}), ...(u.defended ? { defended: true } : {}), weapons: u.parts.filter(p => resolveRobotBasicPart(p.partId, p.level).slot === "weapon").map(p => ({ name: basicParts.parts.find(b => b.id === p.partId)!.name, level: p.level })) })),
    queue, commands: actions.commands ?? [], choices: actions.choices ?? [], blocked: actions.blocked ?? [],
    visualCues,
    latestSummary: (s.latest?.summary ?? "戦闘開始")+(s.resupplyField?`／補給フィールド：R${s.resupplyField.expiresRound}終了まで`:""),
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
