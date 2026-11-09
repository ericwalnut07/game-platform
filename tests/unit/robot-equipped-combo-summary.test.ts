import { describe, expect, it } from "vitest";
import parts from "../../docs/design/robot-tactics/basic-parts.json";
import { describeRobotEquippedCombo } from "../../src/client/games/robot-tactics/RobotComboSummary";
import { ROBOT_WEAPON_FAMILIES } from "../../src/client/games/robot-tactics/RobotWeaponCategories";
import { getRobotWeaponComboPlan } from "../../src/games/robot-tactics/weaponActions";

const byFamily = Object.fromEntries(ROBOT_WEAPON_FAMILIES.map(f => [
  f.id, parts.parts.filter(p => p.slot === "weapon" && p.weaponFamily === f.id).map(p => p.id),
])) as Record<string, string[]>;
const pick = (id: string, level = 1) => ({ partId: id, level });

describe("equipped two-weapon combo summary", () => {
  it("uses the authoritative plan for all 21 unordered family pairs including six same-family distinct weapons", () => {
    const families = ROBOT_WEAPON_FAMILIES.map(f => f.id);
    let count = 0;
    const kinds = new Map<string, number>();
    for (const [i, a] of families.entries()) for (const b of families.slice(i)) {
      const one = pick(byFamily[a]![0]!);
      const two = pick(byFamily[b]![a === b ? 1 : 0]!);
      expect(one.partId).not.toBe(two.partId);
      const plan = getRobotWeaponComboPlan(one, two);
      const shown = describeRobotEquippedCombo(one, two);
      expect(shown.name).toBe(plan.name);
      expect(shown.energyCost).toBe(plan.energyCost);
      expect(shown.description.length).toBeGreaterThan(25);
      expect(shown.families).toBe(`${ROBOT_WEAPON_FAMILIES.find(x => x.id === a)!.name}＋${ROBOT_WEAPON_FAMILIES.find(x => x.id === b)!.name}`);
      const reversed = describeRobotEquippedCombo(two, one);
      expect(reversed.name).toBe(shown.name);
      expect(reversed.energyCost).toBe(shown.energyCost);
      expect(reversed.description).toBe(shown.description);
      count += 1;
      kinds.set(plan.kind, (kinds.get(plan.kind) ?? 0) + 1);
    }
    expect(count).toBe(21);
    expect(Object.fromEntries(kinds)).toEqual({
      "same-family": 6, "melee-melee": 3, "slash-ranged": 3,
      "thrust-ranged": 3, "blunt-ranged": 3, "ranged-ranged": 3,
    });
  });

  it("shows exact current battle costs and effects without mixing standalone weapon EN", () => {
    const cases = [
      [pick("light-blade"), pick("standard-sword"), "同系統強化コンボ", 40, "120%"],
      [pick("light-blade"), pick("heavy-hammer"), "二武器連撃", 50, "最大2回"],
      [pick("light-pistol"), pick("light-grenade-launcher"), "拡散射撃", 50, "70%"],
      [pick("light-blade"), pick("assault-rifle"), "双対象攻撃", 55, "70%"],
      [pick("light-lance"), pick("sniper-rifle"), "貫通射撃", 45, "DEF"],
      [pick("heavy-hammer"), pick("light-pistol"), "衝撃射撃", 40, "2マス"],
    ] as const;
    for (const [a,b,name,en,description] of cases) {
      const summary = describeRobotEquippedCombo(a,b);
      expect(summary.name).toBe(name);
      expect(summary.energyCost).toBe(en);
      expect(summary.description).toContain(description);
    }
    expect(describeRobotEquippedCombo(pick("superheavy-railgun",10),pick("light-pistol")).energyCost).toBe(50);
    expect(() => describeRobotEquippedCombo(pick("light-blade"),pick("light-blade"))).toThrow();
  });
});
