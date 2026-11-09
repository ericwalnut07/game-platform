import basicParts from "../../../../docs/design/robot-tactics/basic-parts.json";

/** Presentation order and names only. Weapon rules and ownership still come
 * from the existing equipment catalog and offline progress. */
export const ROBOT_WEAPON_FAMILIES = [
  { id: "slash", name: "斬撃" },
  { id: "blunt", name: "打撃" },
  { id: "thrust", name: "刺突" },
  { id: "assault", name: "連射" },
  { id: "sniper", name: "狙撃" },
  { id: "blast", name: "爆撃" },
] as const;

export type RobotWeaponFamily = (typeof ROBOT_WEAPON_FAMILIES)[number]["id"];
type WeaponPart = (typeof basicParts.parts)[number];

const knownFamilies = new Set<string>(ROBOT_WEAPON_FAMILIES.map(f => f.id));

export function getRobotWeaponFamily(partId: string): RobotWeaponFamily | null {
  const part = basicParts.parts.find(p => p.id === partId && p.slot === "weapon");
  return part && knownFamilies.has(part.weaponFamily ?? "")
    ? part.weaponFamily as RobotWeaponFamily
    : null;
}

/** Group only unlocked weapons, preserving the adopted catalog order within
 * each group. Every family remains visible even when no items are unlocked. */
export function groupRobotAvailableWeapons(availableIds: readonly string[]): readonly {
  id: RobotWeaponFamily; name: string; parts: readonly WeaponPart[];
}[] {
  const available = new Set(availableIds);
  const weapons = basicParts.parts.filter(p => p.slot === "weapon" && available.has(p.id));
  // A newly defined weapon must be classified explicitly, never disappear from UI.
  if (weapons.some(p => !knownFamilies.has(p.weaponFamily ?? ""))) {
    throw new Error("武器系統が未定義の装備があります。");
  }
  return ROBOT_WEAPON_FAMILIES.map(family => ({
    ...family,
    parts: weapons.filter(part => part.weaponFamily === family.id),
  }));
}
