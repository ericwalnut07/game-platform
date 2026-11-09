import type { RobotPartSelection } from "../../../games/robot-tactics/equipment";
import { getRobotWeaponComboPlan } from "../../../games/robot-tactics/weaponActions";
import { getRobotWeaponFamily, ROBOT_WEAPON_FAMILIES } from "./RobotWeaponCategories";

export interface RobotEquippedComboSummary {
  readonly name: string;
  readonly families: string;
  readonly energyCost: number;
  readonly description: string;
}
const percentage = (value: number) => `${Math.round(value * 100)}%`;

/** Presentation-only adapter backed by the same official combo plan used by
 * battle resolution. No duplicate 21-pair matrix or combat calculation.
 */
export function describeRobotEquippedCombo(
  weapon1: RobotPartSelection, weapon2: RobotPartSelection,
): RobotEquippedComboSummary {
  const plan = getRobotWeaponComboPlan(weapon1, weapon2);
  const familyNames = [weapon1.partId, weapon2.partId].map(id => {
    const family = getRobotWeaponFamily(id);
    const found = ROBOT_WEAPON_FAMILIES.find(row => row.id === family);
    if (!found) throw new Error("装備中の武器系統を解決できません");
    return found.name;
  });
  let description: string;
  switch (plan.kind) {
    case "same-family":
      description = `同系統の武器で通常攻撃ダメージ${percentage(plan.sameFamilyNormalDamageMultiplier!)}。通常攻撃専用の追加効果は発動しません。`;
      break;
    case "melee-melee":
      description = `同じ敵1体へ最大2回攻撃。1撃目で撃破した場合は2撃目を行いません。`;
      break;
    case "ranged-ranged":
      description = `指定した敵と周囲8マスの敵全機へ各${percentage(plan.uniformAreaNormalDamageMultiplier!)}の射撃ダメージ。周囲は壁越しでも自動対象になります。`;
      break;
    case "slash-ranged":
      description = `異なる敵2体を攻撃。斬撃${percentage(plan.slashNormalDamageMultiplier!)}、射撃${percentage(plan.rangedNormalDamageMultiplier!)}。各武器の射程・射線が必要です。`;
      break;
    case "thrust-ranged":
      description = `敵1体へ射撃${percentage(plan.rangedNormalDamageMultiplier!)}。対象の補正後DEFが30を超える部分の半分をダメージ計算時に無視します。`;
      break;
    case "blunt-ranged":
      description = `敵1体へ射撃${percentage(plan.rangedNormalDamageMultiplier!)}。命中した敵を${plan.pushDistance}マス押し出します（衝突判定あり）。`;
      break;
  }
  return { name: plan.name, energyCost: plan.energyCost, families: familyNames.join("＋"), description };
}
