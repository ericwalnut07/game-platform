import policy from "../../../docs/design/robot-tactics/battle-common-policy-2026-11-04.json";
import { resolveRobotBasicPart } from "./equipment";
import { getRobotBattleActor, getRobotBattleUnit, getRobotBattleStructures, requireRobotBattleInput, robotBattleIsAlly, sameRobotCoreCell, finishRobotBattleTurn, recordRobotBattleAction, type RobotBattleCoreState } from "./battleState";
import { commitRobotEnergyAction } from "./energy";
import { applyRobotReactions, hasRobotAddon, robotWeaponReaches } from "./battleEffects";
import { getRobotSpecialWeaponPacket, getRobotBattleBurstOptions, getRobotNormalPushDistance } from "./battleWeaponActions";
import { commitRobotBattleBatch } from "./battleBatch";
import { getRobotLegalMoves, type RobotPosition } from "./movement";
import { settleRobotBattleConsequences } from "./battleSettlement";

export type RobotActiveCombatKind = "overwatch" | "charge-strike" | "super-charge" | "burning-round" | "hp-heal" | "self-heal" | "pull-strike" | "epicenter-echo";
function source(s: RobotBattleCoreState) { const a = getRobotBattleActor(s), u = getRobotBattleUnit(s, a.unitIds[0]!); if (a.unitIds.length !== 1 || u.kind !== "controlled" || u.hp === 0 || !u.position || u.energy.action || u.statuses.length) throw new Error("Current controlled combat actor required"); return u; }
function held(s: RobotBattleCoreState, weaponId: string) { const u = source(s), p = u.parts.find(p => p.partId === weaponId), w = p && resolveRobotBasicPart(p.partId, p.level); if (!w || w.slot !== "weapon") throw new Error("Equipped weapon required"); return w; }
function chargePath(s: RobotBattleCoreState, targetId: string, steps: number): RobotPosition | null {
  const u = source(s), target = getRobotBattleUnit(s, targetId); let position = u.position!;
  for (let i = 0; i < steps; i++) {
    const cell = { x: position.x + Math.sign(target.position!.x - position.x), y: position.y + Math.sign(target.position!.y - position.y) };
    const legal = getRobotLegalMoves({ board: s.board, origin: position, mov: 1, types: ["omni"], facing: "north", occupied: s.units.filter(v => v.id !== u.id && v.hp > 0).map(v => v.position!), structures: getRobotBattleStructures(s) });
    if (!legal.some(m => sameRobotCoreCell(m.destination, cell))) return null; position = cell;
  }
  return position;
}
export function getRobotActiveCombatOptions(s: RobotBattleCoreState, kind: RobotActiveCombatKind, weaponId?: string) {
  const u = source(s), weapon = weaponId ? held(s, weaponId) : null, ranged = !!weapon && ["assault", "sniper", "blast"].includes(weapon.weaponFamily ?? "");
  const addon = { overwatch: null, "charge-strike": null, "super-charge": "super-charge-thruster", "burning-round": "burning-round", "hp-heal": "hp-healing-round", "self-heal": "self-repair-unit", "pull-strike": "lance-pull-strike", "epicenter-echo": "epicenter-echo" }[kind];
  const energyCost = { overwatch: hasRobotAddon(u, "overwatch-amplifier") ? 40 : 25, "charge-strike": 0, "super-charge": 25, "burning-round": 30, "hp-heal": 35, "self-heal": 30, "pull-strike": 30, "epicenter-echo": 50 }[kind];
  let disabledReason = addon && !hasRobotAddon(u, addon) ? "対応パーツが必要です" : u.energy.en < energyCost ? "EN不足" : null;
  let targetIds: string[] = [];
  if (!disabledReason) {
    if (kind === "self-heal") { if (u.hp < u.maxHp) targetIds = [u.id]; }
    else if (kind === "hp-heal") { if (ranged) targetIds = s.units.filter(v => v.id !== u.id && robotBattleIsAlly(v) && v.hp > 0 && v.hp < v.maxHp && robotWeaponReaches(s, u, v, weapon!)).map(v => v.id); }
    else if (kind === "overwatch") { if (!ranged) disabledReason = "射撃系武器を選択してください"; }
    else if (kind === "charge-strike" || kind === "super-charge") {
      const charge = kind === "super-charge" ? policy.charge.super : policy.charge.normal;
      if (!u.energy.moved) disabledReason = "通常移動後に使用できます";
      else if (!weapon || !policy.charge.weaponFamilies.includes(weapon.weaponFamily!) || weapon.range?.max !== 1) disabledReason = "基本最大射程1の近接武器が必要です";
      else targetIds = s.units.filter(v => !robotBattleIsAlly(v) && v.hp > 0 && v.position && Math.max(Math.abs(u.position!.x - v.position.x), Math.abs(u.position!.y - v.position.y)) === charge.distance && chargePath(s, v.id, charge.advance)).map(v => v.id);
    } else if (kind === "epicenter-echo") { if (weapon?.weaponFamily === "blunt" && (weapon.rarity ?? 0) >= 3 && getRobotNormalPushDistance(weapon.id)) targetIds = s.units.filter(v => !robotBattleIsAlly(v) && v.hp > 0 && robotWeaponReaches(s, u, v, weapon)).map(v => v.id); }
    else if (kind === "pull-strike") { if (weapon?.weaponFamily === "thrust" && (weapon.rarity ?? 0) >= 2) targetIds = s.units.filter(v => !robotBattleIsAlly(v) && v.hp > 0 && v.position && Math.max(Math.abs(u.position!.x - v.position.x), Math.abs(u.position!.y - v.position.y)) >= 2 && robotWeaponReaches(s, u, v, weapon)).map(v => v.id); }
    else if (ranged) targetIds = s.units.filter(v => !robotBattleIsAlly(v) && v.hp > 0 && robotWeaponReaches(s, u, v, weapon!)).map(v => v.id);
  }
  return { energyCost, targetIds, disabledReason: disabledReason ?? (kind !== "overwatch" && !targetIds.length ? "合法な対象がありません" : null) };
}
export function commitRobotActiveCombat(s: RobotBattleCoreState, input: { readonly actionId: string; readonly turnId: string; readonly kind: RobotActiveCombatKind; readonly weaponId?: string; readonly targetIds: readonly string[] }) {
  if (!requireRobotBattleInput(s, input.actionId, input.turnId)) return s;
  const u = source(s), options = getRobotActiveCombatOptions(s, input.kind, input.weaponId);
  if (options.disabledReason) throw new Error(options.disabledReason);
  const weapon = input.weaponId ? held(s, input.weaponId) : null;
  if (input.kind === "overwatch") {
    if (input.targetIds.length) throw new Error("Overwatch needs no target");
    const units = s.units.map(v => v.id === u.id ? { ...v, energy: commitRobotEnergyAction(v.energy, { kind: "other", energyCost: options.energyCost }), overwatch: { weaponId: weapon!.id, hitUnitIds: [], multiplier: hasRobotAddon(u, "overwatch-amplifier") ? .9 : .7 } } : v);
    return recordRobotBattleAction(finishRobotBattleTurn({ ...s, units }), input.actionId, u.name + "：迎撃態勢");
  }
  if (new Set(input.targetIds).size !== input.targetIds.length || !input.targetIds.length || !options.targetIds.includes(input.targetIds[0]!)) throw new Error("Legal distinct targets required");
  const target = getRobotBattleUnit(s, input.targetIds[0]!);
  if (input.kind === "self-heal" || input.kind === "hp-heal") {
    if (input.targetIds.length !== 1) throw new Error("One heal target required");
    const amount = Math.max(1, Math.floor(target.maxHp / 4));
    const units = s.units.map(v => { let next = v.id === u.id ? { ...v, energy: commitRobotEnergyAction(v.energy, { kind: "other", energyCost: options.energyCost }) } : v; if (v.id === target.id) next = { ...next, hp: Math.min(next.maxHp, next.hp + amount) }; return next; });
    return recordRobotBattleAction(finishRobotBattleTurn({ ...s, units }), input.actionId, u.name + "：HP回復 → " + target.name);
  }
  if (input.kind === "charge-strike" || input.kind === "super-charge") {
    if (input.targetIds.length !== 1) throw new Error("One charge target required");
    const charge = input.kind === "super-charge" ? policy.charge.super : policy.charge.normal, landing = chargePath(s, target.id, charge.advance)!;
    let next: RobotBattleCoreState = { ...s, units: s.units.map(v => v.id === u.id ? { ...v, position: landing, energy: { ...commitRobotEnergyAction(v.energy, { kind: "normal-attack", energyCost: options.energyCost }), usedExtraMove: true } } : v) };
    const reaction = applyRobotReactions(next, { kind: "move", unitId: u.id }, input.actionId + ":advance");
    next = settleRobotBattleConsequences({ ...next, attackIds: [...next.attackIds, ...reaction.events.map(e => e.attackId)] }, reaction.state.units);
    if (getRobotBattleUnit(next, u.id).hp === 0) return recordRobotBattleAction(finishRobotBattleTurn(next), input.actionId, u.name + "：踏み込み中に撃破", reaction.events);
    const preview = { ...next, units: next.units.map(v => v.id === u.id ? { ...v, energy: { ...v.energy, action: null } } : v) };
    const packet = getRobotSpecialWeaponPacket(preview, weapon!.id, target.id, input.actionId + ":charge", { min: 1, max: 1 }, 1);
    return commitRobotBattleBatch({ ...next, priorDamage: reaction.events }, { actionId: input.actionId, turnId: input.turnId, summary: u.name + (input.kind === "super-charge" ? "：超特攻" : "：特攻"), members: [{ unitId: u.id, action: { kind: "normal-attack", energyCost: options.energyCost } }], prepaidMembers: true, weaponEffectsAllowed: true, ...(getRobotNormalPushDistance(weapon!.id) ? { displacements: [{ sourceId: u.id, targetId: target.id, distance: getRobotNormalPushDistance(weapon!.id) }] } : {}), attacks: [{ ...packet, ...(weapon!.id === "binding-hammer" ? { normalWeaponId: weapon!.id } : {}) }], swordUse: { attack: "normal", attackWeaponIds: [weapon!.id] } });
  }
  if (input.kind === "burning-round") {
    let ids = [...input.targetIds];
    if (weapon!.weaponFamily === "blast") {
      const burst = getRobotBattleBurstOptions(s, weapon!.id), center = burst.centers.find(c => c.centerId === target.id);
      if (!center || !center.neighborSets.some(set => set.length === ids.length - 1 && set.every(id => ids.slice(1).includes(id)))) throw new Error("Legal adopted blast neighborhood required");
    } else if (ids.length !== 1) throw new Error("One burn target required");
    const packets = ids.map((id, i) => getRobotSpecialWeaponPacket(s, weapon!.id, id, input.actionId + ":burn", weapon!.range!, .5, weapon!.weaponFamily === "blast" ? i ? "burst-neighbor" : "burst-center" : "normal", i ? target.id : undefined));
    const packet = { ...packets[0]!, targets: packets.flatMap(p => p.targets) };
    return commitRobotBattleBatch(s, { actionId: input.actionId, turnId: input.turnId, summary: u.name + "：継続燃焼弾", members: [{ unitId: u.id, action: { kind: "other", energyCost: 30 } }], attacks: [packet], burns: ids.map(targetId => ({ sourceId: u.id, targetId })) });
  }
  if (input.kind === "epicenter-echo") {
    if (input.targetIds.length !== 1) throw new Error("One epicenter target required");
    return commitRobotBattleBatch(s, { actionId: input.actionId, turnId: input.turnId, summary: u.name + "：震央反響", members: [{ unitId: u.id, action: { kind: "other", energyCost: 50 } }], attacks: [getRobotSpecialWeaponPacket(s, weapon!.id, target.id, input.actionId + ":echo", weapon!.range!, .9)], displacements: [{ sourceId: u.id, targetId: target.id, distance: getRobotNormalPushDistance(weapon!.id), splash: 25 }] });
  }
  if (input.targetIds.length !== 1) throw new Error("One pull target required");
  return commitRobotBattleBatch(s, { actionId: input.actionId, turnId: input.turnId, summary: u.name + "：引戻し槍撃", members: [{ unitId: u.id, action: { kind: "other", energyCost: 30 } }], attacks: [getRobotSpecialWeaponPacket(s, weapon!.id, target.id, input.actionId + ":pull", weapon!.range!, .8)], displacements: [{ sourceId: u.id, targetId: target.id, distance: 1, pull: true }] });
}
