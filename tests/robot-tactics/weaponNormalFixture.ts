/** Adopted builds and explicit placement for normal-command integration only.
 * Rewards, levels and actor order are test inputs, never a production planner.
 */
import { applyRobotCustomization } from "../../src/games/robot-tactics/customization";
import { weaponCoreFixture } from "./weaponCoreFixture";
import { offlineAddonFixtureProgress } from "./offlineAddonFixture";

const normalFixtureWeapons = { "normal-thrust": "armor-pile", "normal-sniper": "precision-rifle", "normal-railgun": "superheavy-railgun", "normal-pistol": "light-pistol", "normal-assault": "assault-rifle", "normal-corrosion": "corrosion-rifle", "normal-emp": "emp-carbine", "normal-binding": "binding-hammer" } as const;
export type WeaponNormalFixtureCase = keyof typeof normalFixtureWeapons;
export const normalFixtureWeapon = (kind: WeaponNormalFixtureCase) => normalFixtureWeapons[kind];
export const isWeaponNormalFixtureCase = (value: string | null): value is WeaponNormalFixtureCase => value !== null && Object.hasOwn(normalFixtureWeapons, value);
export function weaponNormalFixtureProgress(weaponId: string, level = 1) {
  let p = offlineAddonFixtureProgress();
  for (const [slot, partId] of [["weapon2", weaponId==="double-edged-sword"?"light-pistol":"double-edged-sword"], ["weapon1", weaponId]] as const) {
    if (p.party[0]!.basic[slot].partId !== partId) p = applyRobotCustomization(p, { kind: "part-equip", coreId: "core-a", slot, partId });
  }
  for (let l = 1; l < level; l++) p = applyRobotCustomization(p, { kind: "part-upgrade", coreId: "core-a", partId: weaponId });
  return applyRobotCustomization(p, { kind: "addon-equip", coreId: "core-a", partId: "combat-recovery-circuit" });
}
export function weaponNormalCoreFixture(weaponId: string, level = 1, distance = 2) {
  return weaponCoreFixture({ progress: weaponNormalFixtureProgress(weaponId, level), sourceHp: 150, fillSourceEn: false, targetIds: ["enemy-supreme-commander"], offsets: [{ x: distance, y: 0 }] });
}
