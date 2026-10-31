import catalog from "../../../docs/design/robot-tactics/basic-parts.json";
import { robotNumericComparison, ROBOT_STAT_NAMES, type RobotComparisonRow } from "./customization";
import { resolveRobotBasicPart, type RobotPartSelection, type RobotResolvedPart } from "./equipment";
import type { RobotEquipmentEffect } from "./equipmentEffects";
import type { RobotStat } from "./growth";
import { getRobotNormalWeaponEnergyCost } from "./weaponActions";

const families: Readonly<Record<string, string>> = { slash: "斬撃", blunt: "打撃", thrust: "刺突", assault: "連射", sniper: "狙撃", blast: "爆撃" };
function effectName(part: RobotResolvedPart): string {
  const e: RobotEquipmentEffect | null = part.effect;
  if (e) switch (e.kind) {
    case "shield": return `シールド追加軽減 ${Math.round(e.extraReduction * 10000) / 100}%`;
    case "boost": return `追加移動${e.distance}マス・EN${e.energyCost}`;
    case "stationary-energy": return `未移動時 EN+${e.amount}`;
    case "stationary-heal": return `未移動時 HP+${e.amount}`;
    case "energy-regeneration": return `行動終了時 EN+${e.amount}`;
  }
  const raw = catalog.parts.find(p => p.id === part.id)!.builtInEffect as unknown as Record<string, unknown> | undefined;
  if (!raw || raw.kind === "none") return "なし";
  switch (raw.kind) {
    case "sweep": return `薙ぎ払い 最大${raw.targetCap}体・各${Number(raw.areaMultiplier) * 100}%`;
    case "sweep-and-self-damage": return `薙ぎ払い／自傷 通常${Number(raw.selfDamageRatio) * 100}%・コンボ${Number(raw.weaponComboSelfDamageRatio) * 100}%・攻撃連携${Number(raw.formationSelfDamageRatio) * 100}%`;
    case "blast": return `爆撃 中心${Number(raw.center) * 100}%・周辺${Number(raw.neighbors) * 100}%`;
    case "push-on-hit": return `命中時 ${raw.distance}マス押し出し`;
    case "on-hit-debuff": return `命中時 ${(Array.isArray(raw.stats) ? raw.stats : [raw.stat]).map(s => ROBOT_STAT_NAMES[s as RobotStat]).join("・")}${raw.delta}`;
    case "on-hit-energy-drain": return `命中時 対象EN−${raw.amount}`;
    case "on-hit-suppress-reaction-attacks": return "命中時 反応攻撃を抑止";
    case "extra-energy-per-weapon-attack": return `通常攻撃 追加EN${getRobotNormalWeaponEnergyCost({ partId: part.id, level: part.level })}`;
    default: throw new Error("未対応のパーツ効果です。");
  }
}
function effectValues(effect: RobotEquipmentEffect) {
  switch (effect.kind) {
    case "shield": return [{ label: "シールド追加軽減率 %", value: Math.round(effect.extraReduction * 10000) / 100, lower: false }];
    case "boost": return [{ label: "追加移動マス", value: effect.distance, lower: false }, { label: "追加移動EN", value: effect.energyCost, lower: true }];
    case "stationary-energy": return [{ label: "未移動時EN回復", value: effect.amount, lower: false }];
    case "energy-regeneration": return [{ label: "終了時EN回復", value: effect.amount, lower: false }];
    case "stationary-heal": return [{ label: "未移動時HP回復", value: effect.amount, lower: false }];
  }
}
export function getRobotBasicPartComparison(selection: RobotPartSelection, current: RobotPartSelection): readonly RobotComparisonRow[] {
  const part = resolveRobotBasicPart(selection.partId, selection.level), old = resolveRobotBasicPart(current.partId, current.level);
  if (part.slot !== old.slot) throw new Error("同じ部位のパーツを比較してください。");
  const rows: RobotComparisonRow[] = [];
  if (part.weaponFamily) rows.push({ label: "武器系統", value: families[part.weaponFamily]!, difference: part.weaponFamily === old.weaponFamily ? "—" : families[old.weaponFamily!] + "→" + families[part.weaponFamily], tone: "neutral" });
  if (part.weaponPower !== null) rows.push(robotNumericComparison("武器威力", part.weaponPower, old.weaponPower));
  for (const stat of Object.keys(ROBOT_STAT_NAMES) as RobotStat[]) if (Object.hasOwn(part.statModifiers, stat) || Object.hasOwn(old.statModifiers, stat)) rows.push(robotNumericComparison(ROBOT_STAT_NAMES[stat] + "補正", part.statModifiers[stat] === undefined ? 0 : part.statModifiers[stat]!, old.statModifiers[stat] === undefined ? 0 : old.statModifiers[stat]!));
  if (part.range && old.range) {
    rows.push(robotNumericComparison("最小射程", part.range.min, old.range.min, true), robotNumericComparison("最大射程", part.range.max, old.range.max));
  }
  rows.push(robotNumericComparison("必要CAP", part.cap, old.cap, true));
  const value = effectName(part), previous = effectName(old);
  if (part.effect && old.effect && part.effect.kind === old.effect.kind) {
    const a = effectValues(part.effect), b = effectValues(old.effect);
    rows.push(...a.map((item, i) => robotNumericComparison(item.label, item.value, b[i]!.value, item.lower)));
  } else rows.push({ label: "固有効果", value, difference: value === previous ? "—" : value === "なし" ? "消失" : previous === "なし" ? "追加" : "変更", tone: value === previous ? "neutral" : part.effect && !old.effect ? "better" : !part.effect && old.effect ? "worse" : "neutral" });
  return rows;
}
export function getRobotPerformanceEquipmentIssueText(reason: string): string {
  if (reason.startsWith("CAP exceeded:")) return "CAP超過";
  if (reason.startsWith("Locked frame:")) return "未解放のフレーム";
  if (reason.startsWith("Locked basic part:")) return "未解放の基本パーツ";
  if (reason.startsWith("Locked addon:")) return "未解放の追加パーツ";
  if (reason.startsWith("Duplicate weapon")) return "同じコアに同じ武器を重複装備";
  if (reason.startsWith("Duplicate addon")) return "同じ追加パーツを重複装備";
  if (reason === "At most one model from each frame group per party") return "パーティ内のフレームグループが重複";
  if (reason.startsWith("Movement addon requires")) return "追加パーツの移動タイプが未選択";
  if (reason.startsWith("Movement addition must")) return "追加移動タイプが元のタイプと重複";
  if (reason.startsWith("MOV8+")) return "MOV8以上の移動範囲は未設計";
  return "装備制約を満たさない構成";
}
