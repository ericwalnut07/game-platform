import { moveRobotThroughHazards } from "./hazards";
import { recordRobotEarlyEntry } from "./earlyMissions";
import { getRobotActionEnergyBlock } from "./energy";
import { clearRobotEnergyLock } from "./energy";
import { getRobotBattleDefense } from "./battleEffects";
import rules from "../../../docs/design/robot-tactics/rules.json";
import addons from "../../../docs/design/robot-tactics/addons.json";
import { calculateRobotBaseDamage, floorRobotDamageProduct } from "./combatMath";
import { checkRobotAttackRange } from "./attackRange";
import { checkRobotAttackSpatial, resolveRobotTargetDamage } from "./attackResolution";
import { getRobotBasicActionModifiers } from "./equipmentEffects";
import { resolveRobotBasicPart } from "./equipment";
import { commitRobotBattleBatch } from "./battleBatch";
import { commitRobotEnergyAction, recordRobotEnergyMove } from "./energy";
import { finishRobotBattleTurn, recordRobotBattleMoveReactions, getRobotBattleActor, getRobotBattleCommandBonus, getRobotBattleEffectiveStats, getRobotBattleStructures, getRobotBattleUnit, recordRobotBattleAction, requireRobotBattleInput, robotBattleIsAlly, sameRobotCoreCell, type RobotBattleCoreState, type RobotBattleUnit } from "./battleState";
import { getRobotBattlePostBaseModifiers, getRobotSpecialWeaponPacket } from "./battleWeaponActions";
import { getRobotLegalMoves, type RobotPosition } from "./movement";

export function robotCombatAddon(unit: RobotBattleUnit, id: string): Record<string, unknown> | null {
  if (!unit.addons?.some(a => a.partId === id)) return null;
  const part = addons.parts.find(p => p.id === id);
  if (!part) throw new Error("Unknown combat addon");
  return part.effect as unknown as Record<string, unknown>;
}
function sourceUnit(s: RobotBattleCoreState, allowFriendly = false): RobotBattleUnit {
  const actor = getRobotBattleActor(s), unit = getRobotBattleUnit(s, actor.unitIds[0]!);
  if (actor.unitIds.length !== 1 || (unit.kind !== "controlled" && !(allowFriendly && unit.kind === "friendly-ai" && s.ai.allowFormations)) || unit.hp <= 0 || !unit.position || unit.energy.action !== null) throw new Error("Current eligible actor required");
  return unit;
}
export function isRobotFormationL(units: readonly Pick<RobotBattleUnit, "position">[]): boolean {
  if (units.length !== 3 || units.some(u => !u.position)) return false;
  const xs = units.map(u => u.position!.x), ys = units.map(u => u.position!.y);
  return new Set(units.map(u => u.position!.x + "," + u.position!.y)).size === 3 && Math.max(...xs) - Math.min(...xs) === 1 && Math.max(...ys) - Math.min(...ys) === 1;
}
function deltaWeapon(source: RobotBattleUnit, weaponId: string) {
  const selection = source.parts.find(p => p.partId === weaponId), weapon = selection && resolveRobotBasicPart(selection.partId, selection.level);
  if (!weapon || weapon.slot !== "weapon" || weapon.weaponPower === null || !weapon.weaponFamily) throw new Error("Equipped formation weapon required");
  let bonus = 0, extra = 0;
  for (const id of ["formation-amplifier-light", "formation-amplifier-medium"]) {
    const effect = robotCombatAddon(source, id);
    if (effect) { bonus += effect.offensiveDamageBonusFraction as number; extra += effect.extraEnergy as number; }
  }
  return { weapon, cost: rules.combat.actions.deltaFormation.energyCost + extra, factor: 1 + bonus };
}
export function getRobotDeltaOptions(s: RobotBattleCoreState, weaponId: string) {
  const source = sourceUnit(s, true), plan = deltaWeapon(source, weaponId);
  const supports = s.units.filter(u => u.id !== source.id && robotBattleIsAlly(u) && u.hp > 0 && u.position && !u.statuses.length);
  const participantSets = supports.flatMap((a, i) => supports.slice(i + 1).filter(b => isRobotFormationL([source, a, b])).map(b => [a.id, b.id]));
  const targetIds = s.units.filter(u => !robotBattleIsAlly(u) && u.hp > 0 && u.position).map(u => u.id);
  const disabledReason = s.spentFormations?.includes("delta") ? "デルタはこのラウンドに使用済みです" : source.statuses.length ? "未接続の行動状態があります" : getRobotActionEnergyBlock(source.energy, plan.cost) ?? (!participantSets.length ? "味方3機で2×2のL字配置が必要です" : !targetIds.length ? "生存する敵がいません" : null);
  return { energyCost: plan.cost, participantSets: disabledReason ? [] : participantSets, targetIds: disabledReason ? [] : targetIds, disabledReason };
}
export function commitRobotDelta(s: RobotBattleCoreState, input: { readonly actionId: string; readonly turnId: string; readonly weaponId: string; readonly participantIds: readonly string[]; readonly targetIds: readonly string[] }): RobotBattleCoreState {
  if (!requireRobotBattleInput(s, input.actionId, input.turnId)) return s;
  const source = sourceUnit(s, true), options = getRobotDeltaOptions(s, input.weaponId), plan = deltaWeapon(source, input.weaponId);
  if (options.disabledReason) throw new Error(options.disabledReason);
  if (input.participantIds.length !== 2 || new Set(input.participantIds).size !== 2 || !options.participantSets.some(ids => ids.every(id => input.participantIds.includes(id)))) throw new Error("Legal distinct supporters required");
  if (!input.targetIds.length || input.targetIds.length > rules.combat.actions.deltaFormation.targetsMax || new Set(input.targetIds).size !== input.targetIds.length || input.targetIds.some(id => !options.targetIds.includes(id))) throw new Error("One to three distinct living enemies required");
  const contributors = [source, ...input.participantIds.map(id => getRobotBattleUnit(s, id))];
  const stat = ["slash", "blunt", "thrust"].includes(plan.weapon.weaponFamily!) ? "melee" : "ranged";
  const targets = input.targetIds.map(id => {
    const target = getRobotBattleUnit(s, id);
    const attackStat = contributors.reduce((sum, u) => sum + getRobotBattleEffectiveStats(u)[stat] + getRobotBattleCommandBonus(s, u.id, target.id)[stat], 0);
    const base = calculateRobotBaseDamage({ attackStat, weaponPower: plan.weapon.weaponPower!, targetDef: getRobotBattleDefense(s, target), actionMultiplier: .5, areaMultiplier: 1 });
    const resolution = resolveRobotTargetDamage({ attackLegal: true, spatial: { canReach: true, reason: "clear", sight: null }, effect: { kind: "damaging", product: { base, factors: [plan.factor, ...getRobotBattlePostBaseModifiers(s, source, target)] }, resolveAfterModifiers: () => floorRobotDamageProduct(base, [plan.factor, ...getRobotBattlePostBaseModifiers(s, source, target)]) } });
    return { entityId: id, cells: [target.position!], resolution };
  });
  return commitRobotBattleBatch({ ...s, spentFormations: [...(s.spentFormations ?? []), "delta"] }, { actionId: input.actionId, turnId: input.turnId, summary: source.name + "：デルタ連携", members: [{ unitId: source.id, action: { kind: "other", energyCost: plan.cost } }], attacks: [{ id: input.actionId + ":delta", sourceId: source.id, effectKind: "delta", targets }], swordUse: { attack: "delta", attackWeaponIds: [plan.weapon.id] } });
}
export function getRobotExtraMoveOptions(s: RobotBattleCoreState) {
  const unit = sourceUnit(s), plan = getRobotBasicActionModifiers(unit.parts.map(p => resolveRobotBasicPart(p.partId, p.level)));
  const moves = unit.energy.moved && !getRobotActionEnergyBlock(unit.energy, plan.extraMoveEnergyCost) && unit.movement ? getRobotLegalMoves({ ...unit.movement, mov: plan.extraMoveDistance, board: s.board, origin: unit.position!, occupied: s.units.filter(u => u.hp > 0 && u.id !== unit.id).map(u => u.position!), structures: getRobotBattleStructures(s) }) : [];
  return { energyCost: plan.extraMoveEnergyCost, moves, disabledReason: !unit.energy.moved ? "通常移動後に使用できます" : getRobotActionEnergyBlock(unit.energy, plan.extraMoveEnergyCost) ?? (!moves.length ? "合法な移動先がありません" : null) };
}
export function commitRobotExtraMove(s: RobotBattleCoreState, input: { readonly actionId: string; readonly turnId: string; readonly destination: RobotPosition }): RobotBattleCoreState {
  if (!requireRobotBattleInput(s, input.actionId, input.turnId)) return s;
  const unit = sourceUnit(s), options = getRobotExtraMoveOptions(s);
  if (options.disabledReason || !options.moves.some(m => sameRobotCoreCell(m.destination, input.destination))) throw new Error(options.disabledReason ?? "Illegal extra move");
  const energy = recordRobotEnergyMove(commitRobotEnergyAction(unit.energy, { kind: "extra-move", energyCost: options.energyCost }), "extra");
  const moved=moveRobotThroughHazards({...s,units:s.units.map(u=>u.id===unit.id?{...u,energy}:u)},unit.id,options.moves.find(m=>sameRobotCoreCell(m.destination,input.destination))!.path,input.actionId);
  return recordRobotBattleMoveReactions({...moved.state,priorDamage:[...(s.priorDamage??[]),...moved.events]},unit.id,input.actionId,unit.name+"：追加移動");
}
export type RobotSupportKind = "en-supply" | "cleanse";
export function getRobotSupportTargets(s: RobotBattleCoreState, kind: RobotSupportKind, weaponId?: string) {
  const source = sourceUnit(s), effect = robotCombatAddon(source, kind === "en-supply" ? "en-supply-round" : "status-repair");
  if (!effect) return { energyCost: 0, targetIds: [] as string[], disabledReason: "対応する追加パーツが必要です" };
  const cost = effect.energyCost as number, selection = weaponId ? source.parts.find(p => p.partId === weaponId) : undefined;
  const weapon = selection && resolveRobotBasicPart(selection.partId, selection.level);
  if (kind === "en-supply" && (!weapon?.range || !["assault", "sniper", "blast"].includes(weapon.weaponFamily ?? ""))) return { energyCost: cost, targetIds: [] as string[], disabledReason: "装備中の射撃武器が必要です" };
  const targetIds = getRobotActionEnergyBlock(source.energy, cost) ? [] : s.units.filter(u => {
    if (!robotBattleIsAlly(u) || u.hp <= 0 || !u.position) return false;
    if (kind === "cleanse") return Math.max(Math.abs(u.position.x - source.position!.x), Math.abs(u.position.y - source.position!.y)) <= (effect.maxDistance as number) && (u.mineSlowUntilOwnTurn !== undefined || !!u.weaponDebuffs?.length || !!u.burning || u.rootedUntilOwnTurn !== undefined || u.energy.lockedUntilOwnTurn !== undefined) && !u.statuses.length;
    return u.energy.maxEn > 0 && u.energy.en < u.energy.maxEn && checkRobotAttackSpatial({ kind: "normal", range: checkRobotAttackRange({ origin: source.position!, target: u.position, min: weapon!.range!.min, max: weapon!.range!.max }), sight: { board: s.board, origin: source.position!, target: u.position } }).canReach;
  }).map(u => u.id);
  return { energyCost: cost, targetIds, disabledReason: getRobotActionEnergyBlock(source.energy, cost) ?? (!targetIds.length ? "合法な支援対象がいません" : null) };
}
export function commitRobotSupport(s: RobotBattleCoreState, input: { readonly actionId: string; readonly turnId: string; readonly kind: RobotSupportKind; readonly targetId: string; readonly weaponId?: string }): RobotBattleCoreState {
  if (!requireRobotBattleInput(s, input.actionId, input.turnId)) return s;
  const source = sourceUnit(s), options = getRobotSupportTargets(s, input.kind, input.weaponId);
  if (options.disabledReason || !options.targetIds.includes(input.targetId)) throw new Error(options.disabledReason ?? "Illegal support target");
  const energy = commitRobotEnergyAction(source.energy, { kind: "other", energyCost: options.energyCost });
  const units = s.units.map(u => {
    let next = u.id === source.id ? { ...u, energy } : u;
    if (u.id === input.targetId) {
      if (input.kind === "en-supply") next = { ...next, energy: { ...next.energy, en: Math.min(next.energy.maxEn, next.energy.en + (robotCombatAddon(source, "en-supply-round")!.allyEnGain as number)) } };
      else { const { weaponDebuffs: _debuffs, burning: _burning, mineSlowUntilOwnTurn: _mine, rootedUntilOwnTurn: _root, ...rest } = next; next = { ...rest, energy: clearRobotEnergyLock(rest.energy) }; }
    }
    return next;
  });
  return recordRobotBattleAction(finishRobotBattleTurn({ ...s, units }), input.actionId, source.name + (input.kind === "en-supply" ? "：EN供給" : "：状態修復") + " → " + getRobotBattleUnit(s, input.targetId).name);
}
export type RobotAddonStrike = "close-sniper" | "blade-vault";
export function getRobotAddonStrikeOptions(s: RobotBattleCoreState, kind: RobotAddonStrike, weaponId: string) {
  const source = sourceUnit(s), effect = robotCombatAddon(source, kind === "close-sniper" ? "close-range-sniper" : "blade-vault");
  const selected = source.parts.find(p => p.partId === weaponId), weapon = selected && resolveRobotBasicPart(selected.partId, selected.level), cost = effect?.energyCost as number | undefined;
  const blocked = !effect ? "対応する追加パーツが必要です" : !weapon || weapon.weaponFamily !== (kind === "close-sniper" ? "sniper" : "slash") ? "対応する装備武器が必要です" : weapon.id === "double-edged-sword" ? "刃渡りと諸刃の剣の自傷の合成は未確定です" : getRobotActionEnergyBlock(source.energy, cost!) ?? null;
  const targets: { targetId: string; landing: RobotPosition | null }[] = [];
  if (!blocked) for (const target of s.units.filter(u => !robotBattleIsAlly(u) && u.hp > 0 && u.position)) {
    const range = kind === "close-sniper" ? { min: Math.min(...effect!.allowedDistances as number[]), max: Math.max(...effect!.allowedDistances as number[]) } : { min: 1, max: 1 };
    try { getRobotSpecialWeaponPacket(s, weaponId, target.id, "special-preview", range, effect!.damageMultiplier as number); } catch { continue; }
    let landing: RobotPosition | null = null;
    if (kind === "blade-vault") {
      landing = { x: 2 * target.position!.x - source.position!.x, y: 2 * target.position!.y - source.position!.y };
      const moves = getRobotLegalMoves({ board: s.board, origin: target.position!, mov: 1, types: ["omni"], facing: source.movement?.facing ?? "north", occupied: s.units.filter(u => u.hp > 0 && u.id !== target.id).map(u => u.position!), structures: getRobotBattleStructures(s) });
      if (!moves.some(m => sameRobotCoreCell(m.destination, landing!))) continue;
    }
    targets.push({ targetId: target.id, landing });
  }
  return { energyCost: cost ?? 0, targets, disabledReason: blocked ?? (targets.length ? null : "合法な対象・着地点がありません") };
}
export function commitRobotAddonStrike(s: RobotBattleCoreState, input: { readonly actionId: string; readonly turnId: string; readonly kind: RobotAddonStrike; readonly weaponId: string; readonly targetId: string }): RobotBattleCoreState {
  if (!requireRobotBattleInput(s, input.actionId, input.turnId)) return s;
  const source = sourceUnit(s), options = getRobotAddonStrikeOptions(s, input.kind, input.weaponId), target = options.targets.find(t => t.targetId === input.targetId);
  if (options.disabledReason || !target) throw new Error(options.disabledReason ?? "Illegal special target");
  const effect = robotCombatAddon(source, input.kind === "close-sniper" ? "close-range-sniper" : "blade-vault")!;
  const range = input.kind === "close-sniper" ? { min: Math.min(...effect.allowedDistances as number[]), max: Math.max(...effect.allowedDistances as number[]) } : { min: 1, max: 1 };
  const packet = getRobotSpecialWeaponPacket(s, input.weaponId, input.targetId, input.actionId + ":special", range, effect.damageMultiplier as number);
  let next = target.landing ? { ...s, units: s.units.map(u => u.id === source.id ? { ...u, position: target.landing, energy: { ...u.energy, usedExtraMove: true } } : u) } : s;
  if(target.landing)next=recordRobotEarlyEntry(next,source.id,target.landing);
  return commitRobotBattleBatch(next, { actionId: input.actionId, turnId: input.turnId, summary: source.name + (input.kind === "close-sniper" ? "：近接狙撃" : "：刃渡り"), members: [{ unitId: source.id, action: { kind: "other", energyCost: options.energyCost } }], attacks: [packet] });
}
