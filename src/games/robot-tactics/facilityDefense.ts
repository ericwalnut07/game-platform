import type { RobotBattleCoreState } from "./battleState";
import { getRobotStagePlan } from "./stageCatalog";

const defenderSquads: Readonly<Record<number, readonly [string, string]>> = {
  4: ["left-defenders", "right-defenders"],
  11: ["west-depot-guards", "east-depot-guards"],
  18: ["west-bunker", "east-snipers"],
  23: ["west-depot-guard", "east-depot-fireline"],
  25: ["west-supply-shield", "east-crossfire"],
  29: ["west-depot-shield", "east-suppressors"],
};

export function getRobotFacilitySide(id: string): "left" | "right" | undefined {
  if (["depot-left", "depot-west", "western-hub", "west-supply", "west-cache"].includes(id)) return "left";
  if (["depot-right", "depot-east", "eastern-hub", "east-supply", "east-cache"].includes(id)) return "right";
}

export function getRobotFacilityGuards(s: RobotBattleCoreState, id: string) {
  const side = getRobotFacilitySide(id);
  const squad = side && defenderSquads[s.key.missionNumber]?.[side === "left" ? 0 : 1];
  if (!squad) return [];
  const initial = getRobotStagePlan(s.key).initialEnemies.find(enemy => enemy.id === squad);
  if (!initial) return [];
  return s.units.filter(u => u.squadId === squad && [1, 2, 3].some(slot => u.id === `${squad}:${slot}`));
}

/** Apply once to the complete, legal pre-shield damage for one HP pool. */
export function resolveRobotFacilityDamage(s: RobotBattleCoreState, id: string, damage: number): number {
  if (damage <= 0) return 0;
  const living = getRobotFacilityGuards(s, id).filter(u => u.hp > 0).length;
  return Math.max(1, Math.floor(damage * (6 - living) / 6));
}
