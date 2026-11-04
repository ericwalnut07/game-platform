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
  const visualCues: RobotVfxCue[] = [];
  s.latest?.blastEmptyCenters?.forEach((cell, i) => visualCues.push({ id: `${s.latest!.id}:empty-blast:${i}`, effect: "blast", cell }));
  for (const unit of s.units) {
    const boss = unit.boss, mission = boss?.plan.missionNumber;
    const effect = mission === 16 ? "defense_order" : mission === 22 ? "artillery_order" : mission === 30 ? "supreme_order" : null;
    if (boss && effect && boss.lastSkillOwnTurn !== null && unit.hp > 0 && unit.position) visualCues.push({ id: `command:${unit.id}:${boss.lastSkillOwnTurn}`, effect, cell: unit.position });
  }
  if (s.objective.kind === "m30") {
    const data = s.objective.state.data, carrier = s.units.find(u => u.id === data.carrierId);
    if (carrier?.position) visualCues.push({ id: "data:pickup:" + carrier.id, effect: "data_pickup", cell: carrier.position });
    if (data.sent) visualCues.push({ id: "data:sent", effect: "data_transmit", cell: robotCellToPosition("I14") });
  }
  const visualStatuses = (id: string): RobotVfxId[] => {
    const unit = getRobotBattleUnit(s, id), bonus = getRobotBattleCommandBonus(s, id, null), effects: RobotVfxId[] = [];
    if (unit.burning) effects.push("dot");
    if (unit.shielded || unit.defended || unit.formationDefense?.length || unit.stationaryDefense || bonus.defense > 0) effects.push("defense_up");
    if (bonus.melee > 0 || bonus.ranged > 0) effects.push("attack_up");
    if (unit.weaponDebuffs?.some(d => d.stat === "def" && d.delta < 0)) effects.push("defense_down");
    return effects;
  };
  const damage = s.latest?.damage ?? [];
  const model: RobotBattleViewModel = {
    checkpoint, turnId: robotBattleTurnId(s), round: s.allied.round, roundLimit: getRobotStagePlan(s.key).roundLimit,
    board: s.board, structures: getRobotBattleFacilities(s).map(o => ({ id: o.id, name: "防衛施設", cells: o.cells, hp: o.hp, maxHp: o.maxHp, def: o.def })),
    units: s.units.filter(u => u.hp > 0 && u.position !== null).map(u => ({ id: u.id, name: u.name, kind: robotBattleIsAlly(u) ? u.kind as "controlled" | "friendly-ai" : "enemy", cell: u.position!, hp: u.hp, maxHp: u.maxHp, en: u.energy.en, maxEn: u.energy.maxEn, ...(u.kind === "light" ? { hasEnergyResource: false } : {}), visualStatuses: visualStatuses(u.id), ...(u.shielded ? { shielded: true } : {}), ...(u.defended ? { defended: true } : {}), weapons: u.parts.filter(p => resolveRobotBasicPart(p.partId, p.level).slot === "weapon").map(p => ({ name: basicParts.parts.find(b => b.id === p.partId)!.name, level: p.level })) })),
    queue, commands: actions.commands ?? [], choices: actions.choices ?? [], blocked: actions.blocked ?? [],
    visualCues,
    latestSummary: s.latest?.summary ?? "戦闘開始",
    latestAction: s.latest ? { id: s.latest.id, hits: damage.flatMap((event, eventIndex) => event.cells.map((cell, i) => {
      const target = s.units.find(u => u.id === event.targetId), facility = getRobotBattleFacilities(s).find(f => f.id === event.targetId);
      const final = !damage.slice(eventIndex + 1).some(e => e.targetId === event.targetId && e.damage !== null);
      const destroyed = i === 0 && event.damage !== null && final && (target?.hp === 0 || facility?.hp === 0);
      return { cell, kind: event.effectKind, damage: i === 0 ? event.damage : null, pulse: pulses.indexOf(event.attackId), impact: target?.kind === "light" ? "light" as const : "heavy" as const, ...(destroyed ? { destroyed: target?.kind === "light" ? "small" as const : "large" as const } : {}) };
    })), ...(s.latest.areaCells ? { areaCells: s.latest.areaCells } : {}) } : null,
    ai: { ...s.ai, ...(s.units.some(u => u.kind === "controlled" && u.addons?.some(a => a.partId === "friendly-ai-formation-enabler")) ? { formationUnlocked: true } : {}) }
  };
  assertRobotBattleViewModel(model); return model;
}
