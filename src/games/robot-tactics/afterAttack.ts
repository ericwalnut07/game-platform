import { getRobotSpecialFacilityPacket, getRobotSpecialFacilityTargets } from "./specialFacilityTargets";
import { reconcileRobotEarlyMission, recordRobotEarlyAdvance, robotHasExtracted } from "./earlyMissions";
/** Saved optional continuation; the original action is already paid and resolved. */
import { getRobotAddonCost, getRobotCombatWeapon } from "./combatAddons";
import { resolveRobotBasicPart } from "./equipment";
import { getRobotActionEnergyBlock } from "./energy";
import { getRobotLegalMoves, type RobotPosition } from "./movement";
import { getRobotBattleActor, getRobotBattleFacilities, isRobotBattleHostileObject, getRobotBattleResult, getRobotBattleStructures, getRobotBattleUnit, finishRobotBattleTurn, recordRobotBattleAction, requireRobotBattleInput, robotBattleIsAlly, sameRobotCoreCell, type RobotBattleCoreState } from "./battleState";
import { applyRobotReactions, robotWeaponReaches } from "./battleEffects";
import { settleRobotBattleConsequences } from "./battleSettlement";
import { commitRobotBattleBatch } from "./battleBatch";
import { getRobotSpecialWeaponPacket } from "./battleWeaponActions";
import { getRobotChargeLanding, getRobotChargeFacilityLanding } from "./activeCombat";
export interface RobotAfterAttack {
    readonly ownerId: string;
    readonly moves: readonly ("slash-followthrough" | "melee-slash-through")[];
    readonly chainWeaponIds: readonly string[];
    readonly usedMoves: readonly string[];
    readonly chainUsed: boolean;
}
const has = (s: RobotBattleCoreState, id: string) => getRobotBattleUnit(s, getRobotBattleActor(s).unitIds[0]!).addons?.some(a => a.partId === id);
/** Credit follows the first lethal receipt, not simply any death during the action.
 * Delayed explosions retain their bomb owner's separate attack attribution. */
export function robotAttackKilledEnemy(before: RobotBattleCoreState, after: RobotBattleCoreState, events: readonly NonNullable<RobotBattleCoreState["latest"]>["damage"][number][], sourceId: string): boolean {
    const hp = new Map(before.units.filter(u => u.hp > 0 && !robotBattleIsAlly(u)).map(u => [u.id, u.hp]));
    for (const event of events) {
        const remaining = hp.get(event.targetId);
        if (remaining === undefined || remaining <= 0 || event.damage === null) continue;
        const next = Math.max(0, remaining - event.damage); hp.set(event.targetId, next);
        if (next === 0 && event.sourceId === sourceId && event.effectKind !== "special:delayed-fuse" && event.effectKind !== "special:dot" && getRobotBattleUnit(after, event.targetId).hp === 0) return true;
    }
    return false;
}
export function prepareRobotAfterAttack(before: RobotBattleCoreState, after: RobotBattleCoreState, input: {
    readonly weaponIds: readonly string[];
    readonly kind: string;
    readonly hit: boolean;
    readonly killed: boolean;
}): RobotBattleCoreState {
    const actor = getRobotBattleActor(before), u = getRobotBattleUnit(after, actor.unitIds[0]!);
    if (actor.unitIds.length !== 1 || u.kind !== "controlled" || u.hp === 0 || before.afterAttack)
        return after;
    const weapons = input.weaponIds.map(id => getRobotCombatWeapon(resolveRobotBasicPart(id, u.parts.find(p => p.partId === id)!.level), u.addons));
    const moves: RobotAfterAttack["moves"][number][] = [];
    if (has(before, "slash-followthrough") && weapons.some(w => w.weaponFamily === "slash") && ["normal", "sweep", "charge-strike", "super-charge"].includes(input.kind))
        moves.push("slash-followthrough");
    if (has(before, "melee-slash-through") && input.kind === "normal" && input.hit && weapons.some(w => ["slash", "blunt", "thrust"].includes(w.weaponFamily!)))
        moves.push("melee-slash-through");
    const chainWeaponIds = has(before, "chain-slash-reactor") && input.killed ? weapons.filter(w => w.weaponFamily === "slash" && (w.rarity ?? 0) >= 3).map(w => w.id) : [];
    return moves.length || chainWeaponIds.length ? { ...after, afterAttack: { ownerId: u.id, moves, chainWeaponIds, usedMoves: [], chainUsed: false } } : after;
}
export function getRobotAfterAttackOptions(s: RobotBattleCoreState) {
    const p = s.afterAttack;
    if (!p)
        throw new Error("No post-attack selection");
    const u = getRobotBattleUnit(s, p.ownerId);
    const moves = p.moves.length ? getRobotLegalMoves({ board: s.board, origin: u.position!, mov: 1, types: ["omni"], facing: "north", occupied: s.units.filter(v => v.id !== u.id && v.hp > 0 && v.position).map(v => v.position!), structures: getRobotBattleStructures(s) }).filter(m => !sameRobotCoreCell(m.destination, u.position!)) : [];
    const targets: {
        weaponId: string;
        targetId: string;
        landing: RobotPosition | null;
    }[] = [];
    if (!p.moves.length && !p.chainUsed && !getRobotActionEnergyBlock(u.energy, getRobotAddonCost("chain-slash-reactor")))
        for (const weaponId of p.chainWeaponIds) {
            const selection = u.parts.find(w => w.partId === weaponId)!, weapon = getRobotCombatWeapon(resolveRobotBasicPart(weaponId, selection.level), u.addons);
            const directFacilities = new Set(getRobotSpecialFacilityTargets(s, u.id, weaponId, weapon.range!).map(o => o.objectId));
            for (const object of getRobotBattleFacilities(s)) {
                if (object.hp <= 0 || !isRobotBattleHostileObject(s, u.id, object.id)) continue;
                if (directFacilities.has(object.id)) {
                    targets.push({ weaponId, targetId: object.id, landing: null });
                    continue;
                }
                if (!u.energy.moved || resolveRobotBasicPart(weaponId, selection.level).range?.max !== 1) continue;
                for (const cell of object.cells) {
                    const distance = Math.max(Math.abs(u.position!.x - cell.x), Math.abs(u.position!.y - cell.y));
                    const steps = distance === 2 ? 1 : distance === 3 && has(s, "super-charge-thruster") ? 2 : 0;
                    const landing = steps ? getRobotChargeFacilityLanding(s, u.id, object.id, cell, steps) : null;
                    if (landing) {
                        targets.push({ weaponId, targetId: object.id, landing });
                        break;
                    }
                }
            }
            for (const target of s.units.filter(v => v.hp > 0 && !robotBattleIsAlly(v) && v.position)) {
                if (robotWeaponReaches(s, u, target, weapon))
                    targets.push({ weaponId, targetId: target.id, landing: null });
                else if (u.energy.moved && resolveRobotBasicPart(weaponId, selection.level).range?.max === 1) {
                    const distance = Math.max(Math.abs(u.position!.x - target.position!.x), Math.abs(u.position!.y - target.position!.y)), steps = distance === 2 ? 1 : distance === 3 && has(s, "super-charge-thruster") ? 2 : 0;
                    const landing = steps ? getRobotChargeLanding(s, u.id, target.id, steps) : null;
                    if (landing)
                        targets.push({ weaponId, targetId: target.id, landing });
                }
            }
        }
    return { moves, targets, moveAddon: p.moves[0] ?? null, energyCost: getRobotAddonCost("chain-slash-reactor") };
}
function complete(s: RobotBattleCoreState, id: string, summary: string, events: Parameters<typeof recordRobotBattleAction>[3] = []): RobotBattleCoreState {
    const { afterAttack: _pending, ...rest } = s;
    return recordRobotBattleAction(finishRobotBattleTurn(rest), id, summary, events);
}
export function commitRobotAfterAttack(s: RobotBattleCoreState, input: {
    readonly actionId: string;
    readonly turnId: string;
    readonly kind: "post-move" | "post-skip" | "chain-followup";
    readonly destination?: RobotPosition;
    readonly weaponId?: string;
    readonly targetId?: string;
}): RobotBattleCoreState {
    if (!requireRobotBattleInput(s, input.actionId, input.turnId, true))
        return s;
    const p = s.afterAttack;
    if (!p || getRobotBattleActor(s).unitIds[0] !== p.ownerId)
        throw new Error("Pending post-attack selection required");
    const u = getRobotBattleUnit(s, p.ownerId), o = getRobotAfterAttackOptions(s);
    if (input.kind === "post-skip") {
        if (!p.moves.length)
            return complete(s, input.actionId, u.name + "：追撃を辞退");
        const next = { ...s, afterAttack: { ...p, moves: [], usedMoves: [...p.usedMoves, ...p.moves] } };
        return p.chainWeaponIds.length ? recordRobotBattleAction(next, input.actionId, u.name + "：攻撃後移動を終了") : complete(next, input.actionId, u.name + "：攻撃後移動を終了");
    }
    if (input.kind === "post-move") {
        if (!input.destination || !o.moves.some(m => sameRobotCoreCell(m.destination, input.destination!)))
            throw new Error("Legal optional one-step move required");
        let next: RobotBattleCoreState = { ...s, afterAttack: { ...p, moves: p.moves.slice(1), usedMoves: [...p.usedMoves, p.moves[0]!] }, units: s.units.map(v => v.id === u.id ? { ...v, position: { ...input.destination! }, energy: { ...v.energy, usedExtraMove: true } } : v) };
        next=recordRobotEarlyAdvance(s,next,u.id);
        if (robotHasExtracted(next, u.id)) return complete(reconcileRobotEarlyMission(next), input.actionId, u.name + "：戦線離脱");
        const reaction = applyRobotReactions(next, { kind: "move", unitId: u.id }, input.actionId + ":post-move");
        next = settleRobotBattleConsequences(next, reaction.state.units, [], { ...reaction.state, attackIds: [...new Set([...next.attackIds, ...reaction.state.attackIds, ...reaction.events.map(e => e.attackId)])] });
        if (getRobotBattleUnit(next, u.id).hp === 0 || getRobotBattleResult(next).result !== "ongoing" || !next.afterAttack!.moves.length && !p.chainWeaponIds.length)
            return complete(next, input.actionId, u.name + "：攻撃後移動", reaction.events);
        return recordRobotBattleAction(next, input.actionId, u.name + "：攻撃後移動", reaction.events);
    }
    const selected = o.targets.find(t => t.weaponId === input.weaponId && t.targetId === input.targetId);
    if (!selected)
        throw new Error("Legal chain follow-up target required");
    let next: RobotBattleCoreState = { ...s, afterAttack: { ...p, moves: [], chainWeaponIds: [], chainUsed: true }, units: s.units.map(v => v.id === u.id ? { ...v, position: selected.landing ?? v.position, energy: { ...v.energy, en: v.energy.en - o.energyCost, ...(selected.landing ? { usedExtraMove: true } : {}) } } : v) };
    let events: NonNullable<Parameters<typeof recordRobotBattleAction>[3]> = [];
    if (selected.landing) {
        next=recordRobotEarlyAdvance(s,next,u.id);
        if (robotHasExtracted(next, u.id)) return complete(reconcileRobotEarlyMission(next), input.actionId, u.name + "：戦線離脱");
        const reaction = applyRobotReactions(next, { kind: "move", unitId: u.id }, input.actionId + ":chain-advance");
        events = reaction.events;
        next = settleRobotBattleConsequences(next, reaction.state.units, [], { ...reaction.state, attackIds: [...new Set([...next.attackIds, ...reaction.state.attackIds, ...events.map(e => e.attackId)])] });
        if (getRobotBattleUnit(next, u.id).hp === 0 || getRobotBattleResult(next).result !== "ongoing")
            return complete(next, input.actionId, u.name + "：追撃踏み込み中に撃破", events);
    }
    const preview = { ...next, units: next.units.map(v => v.id === u.id ? { ...v, energy: { ...v.energy, action: null } } : v) }, weapon = resolveRobotBasicPart(selected.weaponId, u.parts.find(w => w.partId === selected.weaponId)!.level);
    const range = selected.landing ? { min: 1, max: 1 } : getRobotCombatWeapon(weapon, u.addons).range!;
    const facility = getRobotSpecialFacilityTargets(preview, u.id, selected.weaponId, range).find(o => o.objectId === selected.targetId);
    const packet = facility ? getRobotSpecialFacilityPacket(preview, u.id, selected.weaponId, facility.objectId, facility.cell, input.actionId + ":chain", range, 1)
        : getRobotSpecialWeaponPacket(preview, selected.weaponId, selected.targetId, input.actionId + ":chain", range, 1);
    // Paid original action receipt remains intact; no action-end recovery before the continuation finishes.
    return commitRobotBattleBatch({ ...next, priorDamage: events }, { actionId: input.actionId, turnId: input.turnId, summary: u.name + "：連鎖斬撃追撃", prepaidMembers: true, members: [{ unitId: u.id, action: u.energy.action! }], attacks: [packet], swordUse: { attack: "normal", attackWeaponIds: [selected.weaponId] }, followup: true });
}
export function assertRobotAfterAttack(s: RobotBattleCoreState): void {
    const p = s.afterAttack;
    if (!p)
        return;
    const u = getRobotBattleUnit(s, p.ownerId);
    if (s.turn.actorId === null || getRobotBattleActor(s).unitIds.length !== 1 || getRobotBattleActor(s).unitIds[0] !== u.id || u.kind !== "controlled" || u.hp === 0 || !u.energy.action || !u.energy.turnOpen || p.chainUsed !== false || new Set(p.chainWeaponIds).size !== p.chainWeaponIds.length || new Set([...p.moves, ...p.usedMoves]).size !== p.moves.length + p.usedMoves.length || p.moves.some(id => !["slash-followthrough", "melee-slash-through"].includes(id) || !has(s, id)) || p.usedMoves.some(id => !["slash-followthrough", "melee-slash-through"].includes(id) || !has(s, id)) || p.chainWeaponIds.some(id => !has(s, "chain-slash-reactor") || !u.parts.some(w => w.partId === id && resolveRobotBasicPart(id, w.level).weaponFamily === "slash" && (resolveRobotBasicPart(id, w.level).rarity ?? 0) >= 3)) || !p.moves.length && !p.chainWeaponIds.length)
        throw new Error("Invalid post-attack checkpoint");
}
