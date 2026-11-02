import { getRobotBattleActor, getRobotBattleFacilities, getRobotBattleLegalMoves, getRobotBattleUnit, type RobotBattleCoreState } from "../../src/games/robot-tactics/battleState";
import { getRobotBattleMemberNormalPacket, getRobotBattleNormalAttackOptions } from "../../src/games/robot-tactics/battleWeaponActions";
import { resolveRobotBasicPart } from "../../src/games/robot-tactics/equipment";
import type { RobotJson } from "../../src/games/robot-tactics/offlineSession";

/** A player test controller using only legal actions against unmodified real
 * stage deployments, NPC decisions, levels and objectives. No test runtime.
 */
export function formalPlayerAction(s: RobotBattleCoreState): RobotJson {
  const actor = getRobotBattleActor(s), unit = getRobotBattleUnit(s, actor.unitIds[0]!);
  const positions = [unit.position!, ...getRobotBattleLegalMoves(s, unit.id).map(m => m.destination)];
  const facility = getRobotBattleFacilities(s)[0]!;
  const enemies = s.units.filter(u => u.hp > 0 && u.kind === "light");
  const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
  const choices = positions.map(cell => {
    const virtual = { ...s, units: s.units.map(u => u.id === unit.id ? { ...u, position: cell } : u) };
    const attacks = unit.parts.filter(p => resolveRobotBasicPart(p.partId, p.level).slot === "weapon").flatMap(p => getRobotBattleNormalAttackOptions(virtual, p.partId).targetIds.map(targetId => {
      const target = getRobotBattleUnit(s, targetId), packet = getRobotBattleMemberNormalPacket(virtual, unit.id, p.partId, targetId, "test-choice");
      const damage = packet.packet.targets[0]!.resolution.damage;
      return { targetId, weaponId: p.partId, score: (damage >= target.hp ? 1000 : 0) + Math.min(target.hp, damage) + Math.max(0, 6 - Math.min(...facility.cells.map(c => dist(c, target.position!)))) * 10 };
    })).sort((a, b) => b.score - a.score);
    return { cell, attack: attacks[0], distance: Math.min(...enemies.map(u => dist(cell, u.position!))) };
  }).sort((a, b) => (b.attack?.score ?? 0) - (a.attack?.score ?? 0) || a.distance - b.distance);
  const chosen = choices[0]!;
  if (chosen.cell.x !== unit.position!.x || chosen.cell.y !== unit.position!.y) return { kind: "move", destination: { ...chosen.cell } };
  return chosen.attack ? { kind: "normal", targetId: chosen.attack.targetId, weaponId: chosen.attack.weaponId } : { kind: "defend" };
}
