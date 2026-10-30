import basicParts from "../../../../docs/design/robot-tactics/basic-parts.json";
import { assertRobotBattleCore, getRobotBattleUnit, robotBattleIsAlly, robotBattleTurnId, type RobotBattleCoreState } from "../../../games/robot-tactics/battleState";
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
  const model: RobotBattleViewModel = {
    checkpoint, turnId: robotBattleTurnId(s), round: s.allied.round, roundLimit: s.key.missionNumber === 2 ? 8 : 16,
    board: s.board, structures: s.objective.kind === "m30" ? [{ id: s.objective.state.facility.id, name: "防衛施設", cells: s.objective.state.facility.cells }] : [],
    units: s.units.filter(u => u.hp > 0 && u.position !== null).map(u => ({ id: u.id, name: u.name, kind: robotBattleIsAlly(u) ? u.kind as "controlled" | "friendly-ai" : "enemy", cell: u.position!, hp: u.hp, maxHp: u.maxHp, en: u.energy.en, maxEn: u.energy.maxEn, weapons: u.parts.filter(p => resolveRobotBasicPart(p.partId, p.level).slot === "weapon").map(p => ({ name: basicParts.parts.find(b => b.id === p.partId)!.name, level: p.level })) })),
    queue, commands: actions.commands ?? [], choices: actions.choices ?? [], blocked: actions.blocked ?? [],
    latestSummary: s.latest?.summary ?? "戦闘開始",
    latestAction: s.latest ? { id: s.latest.id, hits: s.latest.damage.flatMap(event => event.cells.map((cell, i) => ({ cell, kind: event.effectKind, damage: i === 0 ? event.damage : null, pulse: pulses.indexOf(event.attackId) }))) } : null,
    ai: s.ai
  };
  assertRobotBattleViewModel(model); return model;
}
