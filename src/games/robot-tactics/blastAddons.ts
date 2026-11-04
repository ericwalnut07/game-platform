import catalog from "../../../docs/design/robot-tactics/addons.json";
import { getRobotBlastPlan } from "./blast";
import { getRobotAddonCost } from "./combatAddons";
import { resolveRobotBasicPart, type RobotAddonSelection, type RobotPartSelection } from "./equipment";
import { getRobotNormalWeaponEnergyCost } from "./weaponActions";

export type RobotBlastMode = "burst" | "double";
export function getRobotBlastAddonPlan(weapon: RobotPartSelection, addons: readonly RobotAddonSelection[], mode: RobotBlastMode) {
  if (mode !== "burst" && mode !== "double") throw new Error("Unknown blast action");
  const base = getRobotBlastPlan(weapon), resolved = resolveRobotBasicPart(weapon.partId, weapon.level), has = (id: string) => addons.some(a => a.partId === id);
  if (mode === "double" && (!has("double-detonation-control") || (resolved.rarity ?? 0) < 3)) throw new Error("二点起爆には対応パーツと★3爆撃武器が必要です");
  const expanded = has("blast-target-expander"), double = catalog.parts.find(a => a.id === "double-detonation-control")!.effect;
  return { mode, centerCount: mode === "double" ? 2 : 1, emptyCenters: has("empty-tile-targeting"),
    neighborCap: expanded ? 4 : base.neighborTargetCap, baseNeighborCap: base.neighborTargetCap,
    baseEnergyCost: mode === "double" ? getRobotAddonCost("double-detonation-control") : getRobotNormalWeaponEnergyCost(weapon),
    expansionEnergyCost: expanded ? getRobotAddonCost("blast-target-expander", "energyCostExtra") : 0,
    centerMultiplier: mode === "double" ? double.centerMultiplier : base.centerMultiplier,
    neighborMultiplier: mode === "double" ? double.neighborMultiplier : base.neighborMultiplier };
}
export type RobotBlastAddonPlan = ReturnType<typeof getRobotBlastAddonPlan>;
/** Conditional surcharge is assessed once for the complete action, never per explosion. */
export function getRobotBlastSelectionCost(plan: RobotBlastAddonPlan, neighborCounts: readonly number[]): number {
  if (neighborCounts.some(n => !Number.isSafeInteger(n) || n < 0 || n > plan.neighborCap)) throw new Error("Invalid blast neighbor count");
  return plan.baseEnergyCost + (neighborCounts.some(n => n > plan.baseNeighborCap) ? plan.expansionEnergyCost : 0);
}
