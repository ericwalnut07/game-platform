import { describe, expect, it } from "vitest";
import weaponCatalog from "../../docs/design/robot-tactics/basic-parts.json";
import { getRobotWeaponFamily, groupRobotAvailableWeapons, ROBOT_WEAPON_FAMILIES } from "../../src/client/games/robot-tactics/RobotWeaponCategories";

const allWeapons = weaponCatalog.parts.filter(p => p.slot === "weapon");
const expected: Readonly<Record<string, readonly string[]>> = {
  slash: ["light-blade", "standard-sword", "whirlwind-saber", "double-edged-sword"],
  blunt: ["heavy-hammer", "binding-hammer", "quake-hammer", "suppression-mace"],
  thrust: ["light-lance", "lance", "armor-pile"],
  assault: ["light-pistol", "assault-rifle", "corrosion-rifle", "emp-carbine"],
  sniper: ["sniper-rifle", "precision-rifle", "superheavy-railgun"],
  blast: ["light-grenade-launcher", "howitzer", "heavy-missile-cannon", "wide-grenade-cannon"],
};

describe("robot weapon family equipment groups", () => {
  it("classifies all 22 official weapons into six fixed groups exactly once", () => {
    expect(ROBOT_WEAPON_FAMILIES.map(f => f.id)).toEqual(["slash", "blunt", "thrust", "assault", "sniper", "blast"]);
    const groups = groupRobotAvailableWeapons(allWeapons.map(w => w.id));
    expect(groups.map(g => g.name)).toEqual(["斬撃", "打撃", "刺突", "連射", "狙撃", "爆撃"]);
    for (const group of groups) {
      expect(group.parts.map(p => p.id)).toEqual(expected[group.id]);
      for (const part of group.parts) expect(getRobotWeaponFamily(part.id)).toBe(group.id);
    }
    expect(groups.flatMap(g => g.parts).length).toBe(22);
    expect(new Set(groups.flatMap(g => g.parts.map(p => p.id))).size).toBe(22);
  });

  it("shows only owned weapons, retaining empty family headers and catalog order", () => {
    const owned = ["light-pistol", "light-blade", "heavy-hammer", "standard-sword", "light-lance", "standard-engine"];
    const grouped = groupRobotAvailableWeapons(owned);
    expect(grouped.map(g => g.parts.map(p => p.id))).toEqual([
      ["light-blade", "standard-sword"], ["heavy-hammer"], ["light-lance"], ["light-pistol"], [], [],
    ]);
    expect(grouped.length).toBe(6);
    expect(getRobotWeaponFamily("standard-engine")).toBe(null);
    expect(getRobotWeaponFamily("not-a-real-part")).toBe(null);
  });
});
