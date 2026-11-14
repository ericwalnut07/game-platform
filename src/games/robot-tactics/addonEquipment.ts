import catalog from "../../../docs/design/robot-tactics/addons.json";
import type { RobotComparisonRow } from "./customization";
import type { RobotLoadout } from "./equipment";
import type { RobotMovementType } from "./movement";

const MOVEMENT_TYPES: readonly RobotMovementType[] = ["straight", "diagonal", "omni", "forward"];
export function getRobotAddonDefinition(id: string) {
  const part = catalog.parts.find(p => p.id === id);
  if (!part) throw new Error("不明な追加パーツです。");
  const effect = part.effect as unknown as Record<string, unknown>;
  let movementChoices: readonly RobotMovementType[] | null = null;
  if (effect.type === "replace-movement-type" || effect.type === "union-movement-types") {
    const choices = effect.type === "replace-movement-type" ? effect.allowed : effect.otherTypeOf;
    if (!Array.isArray(choices) || !choices.length || choices.some(v => !MOVEMENT_TYPES.includes(v as RobotMovementType))) throw new Error("追加パーツの移動設定が不正です。");
    movementChoices = choices as RobotMovementType[];
  }
  const requiredFrameFamily = "requiredFrameFamily" in part ? part.requiredFrameFamily : undefined;
  return { requiredFrameFamily, id: part.id, name: part.name, cap: part.cap, description: part.description, scope: part.scope, minimumWeaponRarity: part.minimumWeaponRarity, movementChoices };
}
/** The right column describes adding/removing this ID, not replacing another
 * addon or a whole-robot stat total. A movement-choice edit keeps CAP unchanged.
 */
export function getRobotAddonComparison(id: string, core: RobotLoadout): readonly RobotComparisonRow[] {
  const part = getRobotAddonDefinition(id), equipped = core.addons.some(a => a.partId === id);
  const scopes: Readonly<Record<string, string>> = { unit: "機体", "any-weapon": "全武器", melee: "近接", ranged: "射撃", slash: "斬撃", blunt: "打撃", thrust: "刺突", assault: "連射", sniper: "狙撃", blast: "爆撃" };
  const frame = part.requiredFrameFamily === "mobile" ? "機動型" : part.requiredFrameFamily === "defense" ? "防御型" : undefined;
  return [
    ...(frame ? [{ label: "専用フレーム", value: frame, difference: "—", tone: "neutral" as const }] : []),
    { label: "必要CAP", value: String(part.cap), difference: (equipped ? "-" : "+") + part.cap, tone: equipped ? "better" : "worse" },
    { label: "対象系統", value: scopes[part.scope] ?? part.scope, difference: "—", tone: "neutral" },
    { label: "必要レアリティ", value: part.minimumWeaponRarity === null ? "指定なし" : `★${part.minimumWeaponRarity}以上`, difference: "—", tone: "neutral" },
    { label: "効果", value: part.description, difference: equipped ? "解除" : "追加", tone: "neutral" }
  ];
}
