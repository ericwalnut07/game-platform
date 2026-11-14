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
  if (weapon.weaponFamily !== "thrust" || !weapon.range) return weapon;
  const amount = (id: string) => (catalog.parts.find(p => p.id === id)!.effect as { amount: number }).amount;
  const extra = (selections.some(p => p.partId === "extend-lance") ? amount("extend-lance") : 0) + ((weapon.rarity ?? 0) >= 3 && selections.some(p => p.partId === "extreme-lance-extension") ? amount("extreme-lance-extension") : 0);
  return extra ? { ...weapon, range: { ...weapon.range, max: weapon.range.max + extra } } : weapon;
}
export function robotIgnoresNormalSight(weapon: RobotResolvedPart, selections: readonly RobotAddonSelection[] = []): boolean {
  return selections.some(p => p.partId === "indirect-fire-control") && ["assault", "sniper", "blast"].includes(weapon.weaponFamily ?? "");
}
export function getRobotNormalActionCost(selection: RobotPartSelection, selections: readonly RobotAddonSelection[] = []): number {
  const indirect = robotIgnoresNormalSight(resolveRobotBasicPart(selection.partId, selection.level), selections);
  return getRobotNormalWeaponEnergyCost(selection) + (indirect ? (catalog.parts.find(p => p.id === "indirect-fire-control")!.effect as unknown as { energyCostExtra: number }).energyCostExtra : 0);
}
/** The legacy single-target bonus and its expansion upgrade add together. */
export function getRobotUnitNormalFinisherFactor(hp: number, maxHp: number, selections: readonly RobotAddonSelection[] = [], area = false): number {
  const legacy = area ? 1 : getRobotNormalFinisherFactor(hp, maxHp, selections);
  return hp * 2 <= maxHp && selections.some(p => p.partId === "precision-weakness-finisher") ? legacy + .3 : legacy;
}
export function getRobotNormalFinisherFactor(hp: number, maxHp: number, selections: readonly RobotAddonSelection[] = []): number {
  if (!selections.some(p => p.partId === "weakness-finisher")) return 1;
  const effect = catalog.parts.find(p => p.id === "weakness-finisher")!.effect as unknown as { targetHpAtOrBelowFraction: number; damageMultiplier: number };
  return hp <= maxHp * effect.targetHpAtOrBelowFraction ? effect.damageMultiplier : 1;
}
