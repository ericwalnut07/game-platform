import { checkRobotAttackRange } from "./attackRange";
import { checkRobotAttackSpatial } from "./attackResolution";
import { getRobotBattleFacilities, getRobotBattleStructures, isRobotBattleHostileObject, robotBattleIsAlly, sameRobotCoreCell, type RobotBattleCoreState, type RobotBattleUnit } from "./battleState";
import { getRobotCombatWeapon, getRobotNormalActionCost, robotIgnoresNormalSight } from "./combatAddons";
import { getRobotActionEnergyBlock } from "./energy";
import { resolveRobotBasicPart } from "./equipment";
import { getRobotTraversalDistances, type RobotPosition } from "./movement";

export function getRobotNpcRouteDistance(s: RobotBattleCoreState, unit: RobotBattleUnit, objective: { cell: RobotPosition; hold: boolean }) {
  const origin = unit.position!;
  const occupied = s.units.filter(u => u.id !== unit.id && u.hp > 0 && u.position).map(u => u.position!);
  const blockers = [...occupied, ...getRobotBattleStructures(s)];
  const targets = [
    ...s.units.filter(u => u.hp > 0 && u.position && robotBattleIsAlly(u) !== robotBattleIsAlly(unit)).map(u => [u.position!]),
    ...getRobotBattleFacilities(s).filter(o => o.hp > 0 && isRobotBattleHostileObject(s, unit.id, o.id)).map(o => o.cells),
  ];
  const weapons = unit.parts.flatMap(part => {
    const weapon = getRobotCombatWeapon(resolveRobotBasicPart(part.partId, part.level), unit.addons);
    return weapon.slot === "weapon" && weapon.range && !getRobotActionEnergyBlock(unit.energy, getRobotNormalActionCost(part, unit.addons))
      ? [{ range: weapon.range, ignoreSight: robotIgnoresNormalSight(weapon, unit.addons) }] : [];
  });
  const attackCells = (footprint: readonly RobotPosition[]) => {
    const positions: RobotPosition[] = [];
    const max = Math.max(0, ...weapons.map(w => w.range.max));
    for (const target of footprint) {
      for (let y = Math.max(0, target.y - max); y <= Math.min(s.board.height - 1, target.y + max); y++) {
        for (let x = Math.max(0, target.x - max); x <= Math.min(s.board.width - 1, target.x + max); x++) {
          const cell = { x, y };
          if (weapons.some(w => {
            const range = checkRobotAttackRange({ origin: cell, target, ...w.range });
            return range.status === "in-range" && (w.ignoreSight || checkRobotAttackSpatial({
              kind: "normal", range, sight: { board: s.board, origin: cell, target },
            }).canReach);
          })) positions.push(cell);
        }
      }
    }
    return positions;
  };
  const distanceTo = (goals: readonly RobotPosition[]) => {
    const distance = getRobotTraversalDistances(s.board, blockers, goals);
    return distance(origin) === undefined ? null : distance;
  };
  const primary = targets.find(cells => cells.some(cell => sameRobotCoreCell(cell, objective.cell)));
  const direct = objective.hold || !primary ? distanceTo([objective.cell]) : distanceTo(attackCells(primary));
  if (direct) return direct;
  const alternate = !objective.hold && distanceTo(attackCells(targets.flat()));
  if (alternate) return alternate;

  // An occupied hold point or a target temporarily outside every weapon's
  // reach can still be approached. When even this fails, staying is valid.
  const neighbors = (primary ?? [objective.cell]).flatMap(c => [-1, 0, 1].flatMap(y =>
    [-1, 0, 1].map(x => ({ x: c.x + x, y: c.y + y }))));
  const adjacent = distanceTo(neighbors);
  return adjacent ?? (() => 0);
}

