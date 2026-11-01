/** Explicit reward/build/placement inputs for the sweep command, not real AI. */
import { applyRobotCustomization } from "../../src/games/robot-tactics/customization";
import { offlineAddonFixtureProgress } from "./offlineAddonFixture";
import { weaponCoreFixture } from "./weaponCoreFixture";

export function weaponSweepFixtureProgress(expanded = true, weapons: readonly [string, string] = ["double-edged-sword", "light-lance"]) {
  let p = offlineAddonFixtureProgress();
  for (const [i, id] of weapons.entries()) {
    const slot = i === 0 ? "weapon1" : "weapon2";
    if (p.party[0]!.basic[slot].partId !== id) p = applyRobotCustomization(p, { kind: "part-equip", coreId: "core-a", slot, partId: id });
  }
  if (expanded) p = applyRobotCustomization(p, { kind: "addon-equip", coreId: "core-a", partId: "sweep-target-expander" });
  return p;
}
export function weaponSweepCoreFixture(expanded = true, weapons?: readonly [string, string]) {
  return weaponCoreFixture({ progress: weaponSweepFixtureProgress(expanded, weapons), sourceHp: 150, fillSourceEn: false });
}
