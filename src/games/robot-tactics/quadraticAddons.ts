import { getRobotBattleCommandBonus, getRobotBattleEffectiveStats, type RobotBattleCoreState, type RobotBattleUnit } from "./battleState";
import { floorRobotDamageProduct, getRobotEffectiveDefense } from "./combatMath";

export interface RobotQuadraticHit {
  readonly weapon: { readonly weaponFamily: string | null; readonly weaponPower: number | null };
  readonly targetDef: number;
  readonly share: number;
}

/** Independent, target-specific damage, before defensive reductions. */
export function getRobotQuadraticAddonDamage(
  s: RobotBattleCoreState, source: RobotBattleUnit, targetId: string, hit: RobotQuadraticHit | undefined, energyCost: number,
): number {
  if (!hit || energyCost <= 0 || !hit.share || !source.addons?.length) return 0;
  const spirit = source.addons.some(a => a.partId === "spirit-amplification-unit");
  const inertia = (source.energy.moved || source.energy.usedExtraMove) && source.addons.some(a => a.partId === "inertial-impact-unit");
  if (!spirit && !inertia) return 0;
  const stats = getRobotBattleEffectiveStats(source);
  const bonus = getRobotBattleCommandBonus(s, source.id, targetId);
  const stat = ["slash", "blunt", "thrust"].includes(hit.weapon.weaponFamily ?? "") ? "melee" : "ranged";
  const defense = getRobotEffectiveDefense(hit.targetDef);
  const allocated = (coefficient: number, value: number) =>
    floorRobotDamageProduct(Math.floor(coefficient * (value / 100) ** 2 / (defense / 100)), [hit.share]);
  return (spirit ? allocated(2, stats[stat] + bonus[stat] + (hit.weapon.weaponPower ?? 0) / 4) : 0) +
    (inertia ? allocated(6, stats.spd) : 0);
}
