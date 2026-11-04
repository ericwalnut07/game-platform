/** Explicit advanced builds and a center/cross/diagonal test cluster. Never a
 * production mission roster, unlock resolver or initiative/AI policy.
 */
import { applyRobotCustomization } from "../../src/games/robot-tactics/customization";
import { decodeRobotBattleCore, robotBattleIsAlly } from "../../src/games/robot-tactics/battleState";
import { resolveRobotBasicPart } from "../../src/games/robot-tactics/equipment";
import type { RobotOfflineProgress } from "../../src/games/robot-tactics/offlineProgress";
import { weaponCoreFixture } from "./weaponCoreFixture";
import { weaponNormalFixtureProgress } from "./weaponNormalFixture";
import { emptyRobotBattleSelection, type RobotBattleViewModel } from "../../src/client/games/robot-tactics/BattleViewModel";
import { commitRobotBattleBurstAttack, commitRobotBattleNormalAttack, commitRobotBattleSpreadAttack, getRobotBattleBurstOptions, getRobotBattleNormalAttackOptions, getRobotBattleSpreadOptions } from "../../src/games/robot-tactics/battleWeaponActions";
import type { RobotBattleCoreState } from "../../src/games/robot-tactics/battleState";
import { getRobotBattleBlastOptions, commitRobotBattleBlast, type RobotBlastLocation } from "../../src/games/robot-tactics/battleBlast";

export type WeaponAreaFixtureCase = "area-burst" | "area-wide" | "area-normal" | "area-spread" | "area-railgun" | "area-addon" | "area-addon-low";
export const isWeaponAreaFixtureCase = (value: string | null): value is WeaponAreaFixtureCase => value !== null && ["area-burst", "area-wide", "area-normal", "area-spread", "area-railgun", "area-addon", "area-addon-low"].includes(value);
export const weaponAreaCaseWeapons = (kind: WeaponAreaFixtureCase): readonly [string, string] => kind.startsWith("area-addon") ? ["heavy-missile-cannon", "light-lance"] : kind === "area-railgun" ? ["superheavy-railgun", "howitzer"] : kind === "area-spread" ? ["howitzer", "assault-rifle"] : [kind === "area-wide" ? "wide-grenade-cannon" : "howitzer", "double-edged-sword"];
export function weaponAreaFixtureProgress(weapons: readonly [string, string] = ["howitzer", "double-edged-sword"], level = 1) {
  let p = weaponNormalFixtureProgress(weapons[0], level);
  if (p.party[0]!.basic.weapon2.partId !== weapons[1]) p = applyRobotCustomization(p, { kind: "part-equip", coreId: "core-a", slot: "weapon2", partId: weapons[1] });
  return p;
}
export const weaponAreaCaseProgress = (kind: WeaponAreaFixtureCase) => {
  let p = weaponAreaFixtureProgress(weaponAreaCaseWeapons(kind), kind === "area-railgun" ? 10 : 1);
  if (kind.startsWith("area-addon")) p = { ...p, party: p.party.map((c, i) => i ? c : { ...c, addons: ["empty-tile-targeting", "blast-target-expander", "double-detonation-control"].map(partId => ({ partId })) }) };
  return p;
};
export function weaponAreaCoreFixture(options: {
  readonly weapons?: readonly [string, string]; readonly level?: number;
  readonly progress?: RobotOfflineProgress; readonly id?: string; readonly en?: number;
} = {}) {
  const p = options.progress ?? weaponAreaFixtureProgress(options.weapons, options.level), primary = p.party[0]!.basic.weapon1;
  const distance = resolveRobotBasicPart(primary.partId, primary.level).range!.max;
  const seed = weaponCoreFixture({ progress: p, targetIds: ["enemy-supreme-commander"], offsets: [{ x: distance, y: 0 }], openTurn: false });
  const ids = seed.units.filter(u => !robotBattleIsAlly(u) && u.id !== "enemy-supreme-commander").slice(0, 5).map(u => u.id);
  const s = weaponCoreFixture({ id: options.id ?? "area-core-fixture", progress: p, sourceHp: 150, fillSourceEn: false, targetIds: ["enemy-supreme-commander", ...ids, "p2"], offsets: [{ x: distance, y: 0 }, { x: distance, y: -1 }, { x: distance + 1, y: 0 }, { x: distance, y: 1 }, { x: distance - 1, y: 0 }, { x: distance + 1, y: -1 }, { x: distance - 1, y: 1 }] });
  return options.en === undefined ? s : decodeRobotBattleCore({ ...s, units: s.units.map(u => u.id === "p1" ? { ...u, energy: { ...u.energy, en: options.en! } } : u) });
}


export function commitWeaponAreaFixtureAction(s: RobotBattleCoreState, kind: WeaponAreaFixtureCase, identity: { actionId: string; turnId: string }, action: Record<string, unknown>) {
  const [primaryWeaponId, secondaryWeaponId] = weaponAreaCaseWeapons(kind);
  if (kind.startsWith("area-addon")) {
    if (action.kind !== "blast" || (action.mode !== "burst" && action.mode !== "double") || !Array.isArray(action.locations)) throw new Error("Explicit addon blast required");
    return commitRobotBattleBlast(s, { ...identity, weaponId: primaryWeaponId, mode: action.mode, locations: action.locations as unknown as RobotBlastLocation[] });
  }
  if (kind === "area-spread" || kind === "area-railgun") {
    if (action.kind !== "spread" || typeof action.centerId !== "string") throw new Error("One spread center required");
    return commitRobotBattleSpreadAttack(s, { ...identity, primaryWeaponId, secondaryWeaponId, centerId: action.centerId });
  }
  if (action.kind === "area-normal" && typeof action.targetId === "string") return commitRobotBattleNormalAttack(s, { ...identity, weaponId: primaryWeaponId, targetId: action.targetId });
  if (action.kind !== "burst" || typeof action.centerId !== "string" || !Array.isArray(action.neighborIds) || action.neighborIds.some(id => typeof id !== "string")) throw new Error("Explicit burst center and neighbors required");
  return commitRobotBattleBurstAttack(s, { ...identity, weaponId: primaryWeaponId, centerId: action.centerId, neighborIds: action.neighborIds as string[] });
}
export function projectWeaponAreaCommands(s: RobotBattleCoreState, kind: WeaponAreaFixtureCase): Pick<RobotBattleViewModel, "commands" | "choices"> {
  const [primary, secondary] = weaponAreaCaseWeapons(kind);
  if (kind.startsWith("area-addon")) return {
    commands: (["burst", "double"] as const).map(mode => { const blast = getRobotBattleBlastOptions(s, primary, mode); return { id: mode + ":" + primary, category: mode === "double" ? "special" as const : "attack" as const, label: mode === "double" ? "二点起爆" : "爆撃攻撃", targetFlow: "blast" as const, disabledReason: blast.disabledReason, blast: { ...blast, weaponId: primary } }; }), choices: []
  };
  if (kind === "area-spread" || kind === "area-railgun") {
    const options = getRobotBattleSpreadOptions(s, primary, secondary);
    return { commands: [{ id: "spread", category: "attack", label: "拡散射撃（EN50・タップで実行）", immediateTargetTap: true, disabledReason: options.disabledReason }], choices: options.centers.map(c => ({ id: "spread:" + c.centerId, commandId: "spread", selection: { ...emptyRobotBattleSelection(), targetIds: [c.centerId] }, payload: { kind: "spread", centerId: c.centerId } })) };
  }
  const normal = getRobotBattleNormalAttackOptions(s, primary), burst = getRobotBattleBurstOptions(s, primary);
  return {
    commands: [{ id: "area-normal", category: "attack", label: "通常攻撃（単体100%）", disabledReason: normal.disabledReason }, { id: "burst", category: "attack", label: "爆撃攻撃（中心70%・周辺40%）", targetFlow: "blast", confirmLabel: "決定", disabledReason: burst.disabledReason }],
    choices: [...normal.targetIds.map(targetId => ({ id: "area-normal:" + targetId, commandId: "area-normal", selection: { ...emptyRobotBattleSelection(), targetIds: [targetId] }, payload: { kind: "area-normal", targetId } })), ...burst.centers.flatMap(c => c.neighborSets.map((neighborIds, i) => ({ id: "burst:" + c.centerId + ":" + i, commandId: "burst", centerTargetId: c.centerId, areaCells: c.areaCells, selection: { ...emptyRobotBattleSelection(), targetIds: [c.centerId, ...neighborIds] }, payload: { kind: "burst", centerId: c.centerId, neighborIds: [...neighborIds] } })))]
  };
}
