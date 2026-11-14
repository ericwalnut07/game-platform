import { getRobotSpecialFacilityTargets } from "./specialFacilityTargets";
import { getRobotActionEnergyBlock } from "./energy";
import { getRobotFixedAttackCost, getRobotAddonCost } from "./combatAddons";
import { resolveRobotBasicPart } from "./equipment";
import { checkRobotAttackRange } from "./attackRange";
import { checkRobotAttackSpatial } from "./attackResolution";
import { commitRobotEnergyAction } from "./energy";
import { getRobotBattleActor, getRobotBattleCommandBonus, getRobotBattleEffectiveStats, getRobotBattleUnit, requireRobotBattleInput, robotBattleIsAlly, finishRobotBattleTurn, recordRobotBattleAction, type RobotBattleCoreState } from "./battleState";
import { getRobotFusePolicy } from "./fuseTypes";

function actor(s: RobotBattleCoreState, weaponId: string) {
  const a = getRobotBattleActor(s), source = getRobotBattleUnit(s, a.unitIds[0]!), selection = source.parts.find(p => p.partId === weaponId), weapon = selection && resolveRobotBasicPart(selection.partId, selection.level);
  if (a.unitIds.length !== 1 || source.kind !== "controlled" || !source.position || source.hp <= 0 || source.energy.action) throw new Error("Current living controlled fuse actor required");
  return { source, selection, weapon };
}
export function getRobotDelayedFuseOptions(s: RobotBattleCoreState, weaponId: string) {
  const policy = getRobotFusePolicy(), { source, weapon } = actor(s, weaponId), energyCost = getRobotFixedAttackCost(getRobotAddonCost("delayed-fuse"), source.energy, source.addons);
  const disabledReason = !source.addons?.some(a => a.partId === "delayed-fuse") ? "遅延起爆信管が必要です" : weapon?.weaponFamily !== "blast" ? "爆撃武器を選択してください" : s.fuses && JSON.stringify(s.fuses.policy) !== JSON.stringify(policy) ? "戦闘中の起爆ポリシーは変更できません" : getRobotActionEnergyBlock(source.energy, energyCost) ?? null;
  const targetIds = disabledReason ? [] : s.units.filter(u => u.hp > 0 && u.position && robotBattleIsAlly(u) !== robotBattleIsAlly(source) && checkRobotAttackSpatial({ kind: "normal", range: checkRobotAttackRange({ origin: source.position!, target: u.position, ...weapon!.range! }), sight: { board: s.board, origin: source.position!, target: u.position } }).canReach).map(u => u.id);
  if (!disabledReason) targetIds.push(...new Set(getRobotSpecialFacilityTargets(s,source.id,weaponId,weapon!.range!).map(t => t.objectId)));
  return { energyCost, targetIds, disabledReason: disabledReason ?? (targetIds.length ? null : "合法な付着対象がいません") };
}
/** Policy and attack snapshots come only from Core, never from player payloads. */
export function commitRobotDelayedFuse(s: RobotBattleCoreState, input: { readonly actionId: string; readonly turnId: string; readonly weaponId: string; readonly targetId: string }) {
  if (!requireRobotBattleInput(s, input.actionId, input.turnId)) return s;
  const options = getRobotDelayedFuseOptions(s, input.weaponId);
  if (options.disabledReason || !options.targetIds.includes(input.targetId)) throw new Error(options.disabledReason ?? "Illegal bomb attachment target");
  const { source, selection } = actor(s, input.weaponId), target = s.units.find(u => u.id === input.targetId), facility = !target && getRobotSpecialFacilityTargets(s,source.id,input.weaponId,actor(s,input.weaponId).weapon!.range!).find(t => t.objectId === input.targetId), fuses = s.fuses ?? { policy: getRobotFusePolicy(), nextOrder: 0, bombs: [] };
  if (!Number.isSafeInteger(fuses.nextOrder + 1)) throw new Error("Bomb order exceeds safe numeric representation");
  const global = getRobotBattleCommandBonus(s, source.id, null).ranged;
  const bomb = { id: `${s.id}:fuse:${fuses.nextOrder}`, sourceId: source.id, targetId: input.targetId, weapon: { ...selection! }, order: fuses.nextOrder,
    attack: { ranged: getRobotBattleEffectiveStats(source).ranged + global, targetBonuses: s.units.map(u => ({ targetId: u.id, ranged: getRobotBattleCommandBonus(s, source.id, u.id).ranged - global })).filter(b => b.ranged !== 0) },
    dueOwnTurn: target ? target.energy.ownTurn + 1 : 1, ...(facility ? { dueRound: s.allied.round } : {}), lastPosition: { ...(target?.position ?? (facility || undefined)!.cell) }, state: "armed" as const };
  const next = { ...s, fuses: { ...fuses, nextOrder: fuses.nextOrder + 1, bombs: [...fuses.bombs, bomb] }, units: s.units.map(u => u.id === source.id ? { ...u, energy: commitRobotEnergyAction(u.energy, { kind: "other", energyCost: options.energyCost }) } : u) };
  return recordRobotBattleAction(finishRobotBattleTurn(next), input.actionId, source.name + "：時限爆弾を付着 → " + (target ? target.name + "（次の自身手番終了に起爆）" : "施設（ラウンド終了に起爆）"));
}
