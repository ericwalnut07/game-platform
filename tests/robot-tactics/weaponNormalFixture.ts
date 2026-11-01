/** Adopted builds and explicit placement for normal-command integration only.
 * Rewards, levels and actor order are test inputs, never a production planner.
 */
import { applyRobotCustomization } from "../../src/games/robot-tactics/customization";
import { weaponCoreFixture } from "./weaponCoreFixture";
import { offlineAddonFixtureProgress } from "./offlineAddonFixture";

export type WeaponNormalFixtureCase = "normal-thrust" | "normal-sniper" | "normal-railgun";
export const normalFixtureWeapon = (kind: WeaponNormalFixtureCase) => kind === "normal-thrust" ? "armor-pile" : kind === "normal-sniper" ? "precision-rifle" : "superheavy-railgun";
export function weaponNormalFixtureProgress(weaponId: string, level = 1) {
  let p = offlineAddonFixtureProgress();
  for (const [slot, partId] of [["weapon1", weaponId], ["weapon2", "double-edged-sword"]] as const) {
    if (p.party[0]!.basic[slot].partId !== partId) p = applyRobotCustomization(p, { kind: "part-equip", coreId: "core-a", slot, partId });
  }
  for (let l = 1; l < level; l++) p = applyRobotCustomization(p, { kind: "part-upgrade", coreId: "core-a", partId: weaponId });
  return applyRobotCustomization(p, { kind: "addon-equip", coreId: "core-a", partId: "combat-recovery-circuit" });
}
export function weaponNormalCoreFixture(weaponId: string, level = 1, distance = 2) {
  return weaponCoreFixture({ progress: weaponNormalFixtureProgress(weaponId, level), sourceHp: 150, fillSourceEn: false, targetIds: ["enemy-supreme-commander"], offsets: [{ x: distance, y: 0 }] });
}
