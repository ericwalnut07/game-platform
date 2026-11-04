import catalog from "../../../docs/design/robot-tactics/addons.json";
import { resolveRobotBasicPart, type RobotAddonSelection, type RobotPartSelection, type RobotResolvedPart } from "./equipment";
import { getRobotNormalWeaponEnergyCost } from "./weaponActions";
/** Adopted catalogue cost, including zero. Callers choose dedicated/additional semantics. */
export function getRobotAddonCost(id: string, field = "energyCost"): number {
  const effect = catalog.parts.find(p => p.id === id)?.effect as Record<string, unknown> | undefined, value = effect?.[field];
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new Error("Missing adopted addon cost: " + id);
  return value;
}
export function getRobotNormalAttackStatBonus(selections: readonly RobotAddonSelection[] = []): number {
  return selections.reduce((sum, selection) => {
    if (!["normal-attack-assist-small", "normal-attack-assist-medium"].includes(selection.partId)) return sum;
    return sum + (catalog.parts.find(p => p.id === selection.partId)!.effect as unknown as { amount: number }).amount;
  }, 0);
}
export function getRobotCombatWeapon(weapon: RobotResolvedPart, selections: readonly RobotAddonSelection[] = []): RobotResolvedPart {
  if (weapon.weaponFamily !== "thrust" || !weapon.range || !selections.some(p => p.partId === "extend-lance")) return weapon;
  const effect = catalog.parts.find(p => p.id === "extend-lance")!.effect as unknown as { amount: number };
  return { ...weapon, range: { ...weapon.range, max: weapon.range.max + effect.amount } };
}
export function robotIgnoresNormalSight(weapon: RobotResolvedPart, selections: readonly RobotAddonSelection[] = []): boolean {
  return selections.some(p => p.partId === "indirect-fire-control") && ["assault", "sniper", "blast"].includes(weapon.weaponFamily ?? "");
}
export function getRobotNormalActionCost(selection: RobotPartSelection, selections: readonly RobotAddonSelection[] = []): number {
  const indirect = robotIgnoresNormalSight(resolveRobotBasicPart(selection.partId, selection.level), selections);
  return getRobotNormalWeaponEnergyCost(selection) + (indirect ? (catalog.parts.find(p => p.id === "indirect-fire-control")!.effect as unknown as { energyCostExtra: number }).energyCostExtra : 0);
}
export function getRobotNormalFinisherFactor(hp: number, maxHp: number, selections: readonly RobotAddonSelection[] = []): number {
  if (!selections.some(p => p.partId === "weakness-finisher")) return 1;
  const effect = catalog.parts.find(p => p.id === "weakness-finisher")!.effect as unknown as { targetHpAtOrBelowFraction: number; damageMultiplier: number };
  return hp <= maxHp * effect.targetHpAtOrBelowFraction ? effect.damageMultiplier : 1;
}
