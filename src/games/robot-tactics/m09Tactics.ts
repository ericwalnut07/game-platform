import { checkRobotBossSkill, getRobotBossVoluntaryMoves, type RobotBossSkillContext, type RobotBossUnit } from "./bossCommands";
import { getRobotBattleBoss, getRobotBattleStructures, getRobotBattleUnit, robotBattleIsAlly, type RobotBattleCoreState } from "./battleState";
import { robotM09CommanderEscapeScore } from "./earlyTactics";

/** Select the adopted M09 escape command only from legal (at most two-step)
 * destinations. Unlike ordinary movement, this is an EN30 action and cannot
 * attack in the same own turn or trigger on consecutive own turns.
 */
export function getRobotM09NpcDisengage(s: RobotBattleCoreState): Omit<RobotBossSkillContext, "board" | "units"> | null {
  if (s.key.missionNumber !== 9 || s.turn.actorId !== "moving-commander") return null;
  const unit = getRobotBattleUnit(s, "moving-commander");
  if (unit.kind !== "boss" || unit.hp <= 0 || !unit.position || !unit.movement || !unit.energy.turnOpen) return null;
  const boss = getRobotBattleBoss(unit);
  const units: RobotBossUnit[] = s.units.filter(u => u.position !== null).map(u => ({
    id: u.id, kind: u.kind, team: robotBattleIsAlly(u) ? "player" : "enemy",
    hp: u.hp, position: u.position!, squadId: u.squadId,
    ...(u.chassis ? { chassis: u.chassis } : {}),
    carryingUnsentData: u.carriedObjectiveId !== null,
  }));
  const query = {
    board: s.board, origin: unit.position, mov: unit.movement.mov,
    types: unit.movement.types, facing: unit.movement.facing,
    occupied: s.units.filter(u => u.hp > 0 && u.id !== unit.id && u.position).map(u => u.position!),
    structures: getRobotBattleStructures(s),
  };
  const currentScore = robotM09CommanderEscapeScore(s, unit.position);
  const candidates = getRobotBossVoluntaryMoves(boss, query)
    .filter(move => move.path.length <= 2 && robotM09CommanderEscapeScore(s, move.destination) > currentScore)
    .sort((a, b) => robotM09CommanderEscapeScore(s, b.destination) - robotM09CommanderEscapeScore(s, a.destination) ||
      a.destination.y - b.destination.y || a.destination.x - b.destination.x);
  for (const move of candidates) {
    const context = { board: s.board, units, move: { query, destination: move.destination } };
    if (checkRobotBossSkill(boss, context).available) return { move: context.move };
  }
  return null;
}
