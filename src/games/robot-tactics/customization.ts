import { getRobotAddonDefinition } from "./addonEquipment";
import type { RobotMovementType } from "./movement";
import rules from "../../../docs/design/robot-tactics/rules.json";
import frames from "../../../docs/design/robot-tactics/frames.json";
import { getRobotLoadoutPlan, getRobotPartyEquipmentPlan, resolveRobotBasicPart, type RobotEquipmentSlot, type RobotCoreId, type RobotLoadout } from "./equipment";
import { getRobotCoreUpgradeExp, getRobotPartUpgradeExp, getRobotFrameStatPlan, interpolateRobotValue, type RobotStat, type RobotStatValues } from "./growth";
import { applyRobotSharedPartLevels, getRobotOfflineAvailability, validateRobotOfflineProgress, type RobotOfflineProgress } from "./offlineProgress";

export type RobotCustomizationChange =
  | { readonly kind: "frame"; readonly coreId: RobotCoreId; readonly frameId: string }
  | { readonly kind: "core-upgrade"; readonly coreId: RobotCoreId }
  | { readonly kind: "part-equip"; readonly coreId: RobotCoreId; readonly slot: RobotEquipmentSlot; readonly partId: string }
  | { readonly kind: "part-upgrade"; readonly coreId: RobotCoreId; readonly partId: string }
  | { readonly kind: "addon-equip"; readonly coreId: RobotCoreId; readonly partId: string; readonly movementType?: RobotMovementType }
  | { readonly kind: "addon-remove"; readonly coreId: RobotCoreId; readonly partId: string };
export interface RobotCustomizationPreview {
  readonly before: RobotLoadout;
  readonly after: RobotLoadout;
  readonly partyAfter: readonly RobotLoadout[];
  readonly partLevelsAfter: RobotOfflineProgress["partLevels"];
  readonly expCost: number;
  readonly canApply: boolean;
  readonly reasons: readonly string[];
  readonly statsBefore: RobotStatValues;
  readonly statsAfter: RobotStatValues;
  readonly capBefore: number;
  readonly capAfter: number;
  readonly capUsed: number | null;
}
export const ROBOT_STAT_NAMES: Readonly<Record<RobotStat, string>> = {
  hp: "HP", melee: "近接攻撃", ranged: "射撃攻撃", def: "DEF", mov: "MOV", spd: "SPD", en: "EN"
};
export { getRobotFrameName } from "./equipmentLabels";
export const ROBOT_MOVEMENT_NAMES = { straight: "直線", diagonal: "斜線", omni: "全方向", forward: "前方" } as const;

/** Preview and commit use the same equipment/progression functions. Neither
 * accepts client-provided levels, stats, EXP costs or a replacement party.
 */
export function previewRobotCustomization(progress: RobotOfflineProgress, change: RobotCustomizationChange): RobotCustomizationPreview {
  const before = progress.party.find(c => c.coreId === change.coreId);
  if (!before) throw new Error("対象のコアがありません。");
  let after = before, expCost = 0, partLevelsAfter = progress.partLevels;
  let partyAfter: readonly RobotLoadout[] | null = null;
  const reasons: string[] = [];
  if (change.kind === "core-upgrade") {
    if (before.coreLevel === 41) reasons.push("最大Lvです。");
    else { expCost = getRobotCoreUpgradeExp(before.coreLevel, before.coreLevel + 1); after = { ...before, coreLevel: before.coreLevel + 1 }; }
  } else if (change.kind === "frame") {
    if (!frames.frames.some(f => f.id === change.frameId)) throw new Error("不明なフレームです。");
    after = { ...before, frameId: change.frameId };
    if (before.frameId === change.frameId) reasons.push("装備中です。");
  } else if (change.kind === "part-equip") {
    if (!["engine", "weapon1", "weapon2", "armor", "control", "special"].includes(change.slot)) throw new Error("不明な装備部位です。");
    const level = progress.partLevels[change.partId] ?? 1;
    resolveRobotBasicPart(change.partId, level);
    after = { ...before, basic: { ...before.basic, [change.slot]: { partId: change.partId, level } } };
    if (before.basic[change.slot].partId === change.partId) reasons.push("装備中です。");
  } else if (change.kind === "part-upgrade") {
    const level = progress.partLevels[change.partId];
    resolveRobotBasicPart(change.partId, level ?? 1);
    if (level === undefined) reasons.push("未解放です。");
    else if (level === 10) reasons.push("最大Lvです。");
    else {
      expCost = getRobotPartUpgradeExp(level, level + 1);
      partLevelsAfter = { ...progress.partLevels, [change.partId]: level + 1 };
      partyAfter = applyRobotSharedPartLevels(progress.party, partLevelsAfter);
      after = partyAfter.find(c => c.coreId === change.coreId)!;
    }
  } else if (change.kind === "addon-equip" || change.kind === "addon-remove") {
    getRobotAddonDefinition(change.partId);
    if (Object.hasOwn(change, "level")) throw new Error("追加パーツにはLvがありません。");
    const equipped = before.addons.find(a => a.partId === change.partId);
    if (change.kind === "addon-remove") {
      if (!equipped) reasons.push("この追加パーツは装備していません。");
      after = { ...before, addons: before.addons.filter(a => a.partId !== change.partId) };
    } else {
      const selection = change.movementType === undefined ? { partId: change.partId } : { partId: change.partId, movementType: change.movementType };
      if (equipped && equipped.movementType === selection.movementType) reasons.push("装備中です。");
      after = { ...before, addons: equipped ? before.addons.map(a => a.partId === change.partId ? selection : a) : [...before.addons, selection] };
    }
  } else throw new Error("未対応のカスタマイズ操作です。");
  if (progress.exp < expCost) reasons.push("共有EXPが不足しています。");
  const available = getRobotOfflineAvailability(progress);
  const oldPlan = getRobotLoadoutPlan(before, available), nextPlan = getRobotLoadoutPlan(after, available);
  partyAfter ??= progress.party.map(c => c.coreId === change.coreId ? after : c);
  const partyPlan = getRobotPartyEquipmentPlan(partyAfter, available);
  for (const reason of [...partyPlan.blockingIssues, ...partyPlan.robots.flatMap(p => [...p.blockingIssues, ...p.baseStatBlockingIssues])]) {
    const text = (reason.startsWith("Locked frame:") || reason.startsWith("Locked basic part:") || reason.startsWith("Locked addon:")) ? "未解放です。"
      : reason === "At most one model from each frame group per party" ? "同じフレームグループを他のコアが装備中です。"
      : reason.startsWith("CAP exceeded:") ? "装備中のコアのCAP上限を超えています。"
      : reason.startsWith("Duplicate weapon") ? "同じコアに同じ武器を重複装備できません。"
      : reason.startsWith("Duplicate addon") ? "同じ追加パーツを重複装備できません。"
      : reason.startsWith("Movement addon requires") ? "移動タイプを選択してください。"
      : reason.startsWith("Unexpected movement choice:") ? "この追加パーツは移動タイプを選択しません。"
      : reason.startsWith("Friendly formation enabler") ? "友軍AI連携技はチーム全体で1個まで装備できます。"
      : reason.startsWith("Movement addition must") ? "追加する移動タイプが元のタイプと同じです。追加側の設定変更・解除を確認してください。"
      : reason.startsWith("MOV8+") ? "MOV8以上の移動範囲は未設計のため、この構成は使えません。"
      : reason.startsWith("Wrong equipment slot:") ? "装備部位が一致しません。" : "この構成は現在装備できません。";
    if (!reasons.includes(text)) reasons.push(text);
  }
  return { before, after, partyAfter, partLevelsAfter, expCost, canApply: reasons.length === 0, reasons, statsBefore: oldPlan.effectiveStats, statsAfter: nextPlan.effectiveStats, capBefore: oldPlan.capLimit, capAfter: nextPlan.capLimit, capUsed: nextPlan.capUsed };
}
export function applyRobotCustomization(progress: RobotOfflineProgress, change: RobotCustomizationChange): RobotOfflineProgress {
  const preview = previewRobotCustomization(progress, change);
  if (!preview.canApply) throw new Error(preview.reasons.join(" "));
  return validateRobotOfflineProgress({ ...progress, exp: progress.exp - preview.expCost, party: preview.partyAfter, partLevels: preview.partLevelsAfter });
}

export interface RobotComparisonRow {
  readonly label: string; readonly value: string;
  readonly difference: string; readonly tone: "better" | "worse" | "neutral";
}
export function robotNumericComparison(label: string, value: number | null, previous: number | null, lowerIsBetter = false): RobotComparisonRow {
  const delta = value === null || previous === null ? null : value - previous;
  return { label, value: value === null ? "未確定" : String(value), difference: delta === null || delta === 0 ? "—" : (delta > 0 ? "+" : "") + delta, tone: delta === null || delta === 0 ? "neutral" : (delta > 0) !== lowerIsBetter ? "better" : "worse" };
}
/** Frame performance only: remove core contributions already included in the
 * catalog total, so this table never presents whole-robot stats as part stats.
 */
export function getRobotFrameComparison(selectedId: string, currentId: string, coreLevel: number): readonly RobotComparisonRow[] {
  const selected = frames.frames.find(f => f.id === selectedId), current = frames.frames.find(f => f.id === currentId);
  if (!selected || !current) throw new Error("不明なフレームです。");
  const a = getRobotFrameStatPlan(selectedId, coreLevel), b = getRobotFrameStatPlan(currentId, coreLevel);
  // Subtract the shared core-only anchors from inclusive frame totals.
  const modifiers = (id: string) => frameStatModifiers(id, coreLevel);
  const av = modifiers(selectedId), bv = modifiers(currentId);
  const rows = (Object.keys(ROBOT_STAT_NAMES) as RobotStat[]).map(stat => robotNumericComparison(ROBOT_STAT_NAMES[stat] + "補正", stat === "hp" ? a.frameHpBonus : av[stat], stat === "hp" ? b.frameHpBonus : bv[stat]));
  const movement = (f: typeof selected) => ROBOT_MOVEMENT_NAMES[f.movementType as keyof typeof ROBOT_MOVEMENT_NAMES];
  rows.push({ label: "移動タイプ", value: movement(selected), difference: selected.movementType === current.movementType ? "—" : movement(current) + "→" + movement(selected), tone: "neutral" });
  return rows;
}

function frameStatModifiers(id: string, level: number): RobotStatValues {
  const plan = getRobotFrameStatPlan(id, level);
  return Object.fromEntries((Object.keys(ROBOT_STAT_NAMES) as RobotStat[]).map(stat => {
    if (stat === "hp") return [stat, plan.frameHpBonus];
    const core = stat === "mov" ? rules.progression.cores.movementFixedBase : interpolateRobotValue(rules.progression.cores.referenceBaseStats.map(a => ({ level: a.level, value: a[stat] })), level);
    return [stat, plan.stats[stat] === null || core === null ? null : plan.stats[stat] - core];
  })) as unknown as RobotStatValues;
}
