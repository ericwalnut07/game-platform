import { applyRobotEarlyTeleportData, recordRobotEarlyEntry } from "./earlyMissions";
/** Adopted #101 state and support actions. Missing fields keep legacy saves valid. */
import { checkRobotAttackSpatial } from "./attackResolution";
import type { RobotTargetDamageResult } from "./attackResolution";
import { checkRobotAttackRange } from "./attackRange";
import { floorRobotDamageProduct } from "./combatMath";
import { getRobotAddonCost } from "./combatAddons";
import { getRobotUnweakenedDefense, hasRobotAddon, robotWeaponReaches } from "./battleEffects";
import { commitRobotBattleBatch } from "./battleBatch";
import { getRobotSpecialWeaponPacket } from "./battleWeaponActions";
import { getRobotSpecialFacilityTargets, getRobotSpecialFacilityPacket } from "./specialFacilityTargets";
import { commitRobotEnergyAction, getRobotActionEnergyBlock } from "./energy";
import { resolveRobotBasicPart } from "./equipment";
import { decodeRobotBattleCore, finishRobotBattleTurn, getRobotBattleActor, getRobotBattleFacilities, getRobotBattleStructures, getRobotBattleUnit, recordRobotBattleAction, requireRobotBattleInput, robotBattleIsAlly, sameRobotCoreCell, type RobotBattleCoreState, type RobotBattleUnit } from "./battleState";
import { ROBOT_M30_DATA_ID } from "./m30Mission";
import { robotCellToPosition, type RobotPosition } from "./movement";
import { mergeRobotWeaponDebuffs, type RobotWeaponDebuff } from "./weaponHitEffects";
export interface RobotOwnedDuration {
    readonly ownerId: string;
    readonly expiresOwnTurn: number;
}
export interface RobotResupplyField {
    readonly id: string;
    readonly ownerId: string;
    readonly cell: RobotPosition;
    readonly placedRound: number;
    readonly expiresRound: number;
}
export const robotCellDistance = (a: RobotPosition, b: RobotPosition) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
export function applyRobotAdoptedDebuffs(target: RobotBattleUnit, source: RobotBattleUnit, weaponId: string, added: readonly RobotWeaponDebuff[]): readonly RobotWeaponDebuff[] {
    const extended = resolveRobotBasicPart(weaponId, source.parts.find(p => p.partId === weaponId)!.level).weaponFamily === "assault" && hasRobotAddon(source, "assault-debuff-extension");
    if (!extended && !target.weaponDebuffs?.some(d => d.untilOwnTurn !== undefined))
        return mergeRobotWeaponDebuffs(target.weaponDebuffs ?? [], added);
    const next = added.map(d => ({ ...d, untilOwnTurn: target.energy.ownTurn + 1 + (extended ? 1 : 0) }));
    return [...(target.weaponDebuffs ?? []).filter(d => !next.some(n => n.stat === d.stat)), ...next];
}
export function consumeRobotMark(_s: RobotBattleCoreState, source: RobotBattleUnit, target: RobotBattleUnit | undefined, result: RobotTargetDamageResult, consumed: Set<string>): number {
    if (!target?.tacticalMark || !robotBattleIsAlly(source) || result.reason !== "hit" || consumed.has(target.id))
        return result.damage;
    if (!result.product)
        throw new Error("Marked direct damage requires unrounded product");
    consumed.add(target.id);
    return Math.max(1, floorRobotDamageProduct(result.product.base, [...result.product.factors, 1.7]));
}
export function expireRobotOwnedEffects(s: RobotBattleCoreState, u: RobotBattleUnit, startingIds: readonly string[]): RobotBattleUnit {
    let next = u;
    for (const key of ["tacticalMark", "projectedDefense", "weakpoint"] as const) {
        const e = next[key];
        if (e && startingIds.includes(e.ownerId) && e.expiresOwnTurn <= getRobotBattleUnit(s, e.ownerId).energy.ownTurn + 1) {
            const { [key]: _expired, ...rest } = next;
            next = rest;
        }
    }
    return next;
}
export function assertRobotAdoptedEffects(s: RobotBattleCoreState): void {
    for (const u of s.units) {
        for (const key of ["tacticalMark", "projectedDefense", "weakpoint"] as const) {
            const e = u[key];
            if (!e)
                continue;
            const owner = s.units.find(v => v.id === e.ownerId);
            if (!owner || owner.kind !== "controlled" || !hasRobotAddon(owner, key === "tacticalMark" ? "tactical-marking-attack" : key === "weakpoint" ? "weakpoint-targeting" : "projected-defense") || u.hp === 0 || !Number.isSafeInteger(e.expiresOwnTurn) || e.expiresOwnTurn !== owner.energy.ownTurn + 1 || robotBattleIsAlly(u) !== (key === "projectedDefense"))
                throw new Error("Invalid adopted effect owner/expiry");
            if (key === "weakpoint" && (!Number.isSafeInteger(u.weakpoint!.amount) || u.weakpoint!.amount < 0))
                throw new Error("Invalid weakpoint amount");
        }
    }
    const f = s.resupplyField;
    if (f) {
        const owner = s.units.find(u => u.id === f.ownerId);
        if (!owner || owner.kind !== "controlled" || !hasRobotAddon(owner, "resupply-field") || !f.id || f.expiresRound !== f.placedRound + 1 || !Number.isSafeInteger(f.placedRound) || f.placedRound < 1 || s.allied.round < f.placedRound || s.allied.round > f.expiresRound || !Number.isSafeInteger(f.cell.x) || !Number.isSafeInteger(f.cell.y) || f.cell.x < 0 || f.cell.y < 0 || f.cell.x >= s.board.width || f.cell.y >= s.board.height || (s.board.walls.some(c => sameRobotCoreCell(c, f.cell)) || getRobotBattleFacilities(s).some(o=>o.cells.some(c=>sameRobotCoreCell(c,f.cell)))))
            throw new Error("Invalid resupply field");
    }
}
export type RobotAdoptedAction = "tactical-marking-attack" | "projected-defense" | "weakpoint-targeting" | "resupply-field" | "tactical-decoy" | "tactical-teleport-beacon";
function source(s: RobotBattleCoreState) { const a = getRobotBattleActor(s), u = getRobotBattleUnit(s, a.unitIds[0]!); if (a.unitIds.length !== 1 || u.kind !== "controlled" || !u.position || u.hp === 0 || u.statuses.length || u.energy.action)
    throw new Error("Current controlled addon actor required"); return u; }
export function getRobotAdoptedActionOptions(s: RobotBattleCoreState, kind: RobotAdoptedAction, weaponId?: string) {
    const u = source(s), energyCost = getRobotAddonCost(kind), selection = u.parts.find(p => p.partId === weaponId), weapon = selection && resolveRobotBasicPart(selection.partId, selection.level);
    let disabledReason = !hasRobotAddon(u, kind) ? "対応パーツが必要です" : getRobotActionEnergyBlock(u.energy, energyCost);
    const targetIds: string[] = [], cells: RobotPosition[] = [];
    if (!disabledReason) {
        if (kind === "resupply-field" || kind === "tactical-decoy") {
            for (let y = 0; y < s.board.height; y++)
                for (let x = 0; x < s.board.width; x++) {
                    const cell = { x, y };
                    if (robotCellDistance(u.position!, cell) <= (kind === "tactical-decoy" ? 5 : 3) && !s.board.walls.some(c => sameRobotCoreCell(c, cell)) && !getRobotBattleStructures(s).some(c => sameRobotCoreCell(c, cell)) && !s.units.some(v => v.hp > 0 && v.position && sameRobotCoreCell(v.position, cell)))
                        cells.push(cell);
                }
        }
        else
            for (const target of s.units.filter(v => v.hp > 0 && v.position)) {
                const ally = robotBattleIsAlly(target);
                if (kind === "projected-defense" || kind === "tactical-teleport-beacon") {
                    if (ally && target.id !== u.id && robotCellDistance(u.position!, target.position!) <= 3)
                        targetIds.push(target.id);
                }
                else if (!ally) {
                    if (kind === "weakpoint-targeting" && checkRobotAttackSpatial({ kind: "normal", range: checkRobotAttackRange({ origin: u.position!, target: target.position!, min: 1, max: 5 }), sight: { board: s.board, origin: u.position!, target: target.position! } }).canReach)
                        targetIds.push(target.id);
                    if (kind === "tactical-marking-attack" && weapon?.slot === "weapon" && (weapon.rarity ?? 0) >= 2 && robotWeaponReaches(s, u, target, weapon))
                        targetIds.push(target.id);
                }
            }
        if (kind === "tactical-marking-attack" && weapon?.slot === "weapon" && (weapon.rarity ?? 0) >= 2)
            targetIds.push(...new Set(getRobotSpecialFacilityTargets(s,u.id,weapon.id,weapon.range!).map(t=>t.objectId)));
    }
    disabledReason ??= targetIds.length || cells.length ? null : "合法な対象がありません";
    return { energyCost, targetIds, cells, disabledReason };
}
export function commitRobotAdoptedAction(s: RobotBattleCoreState, input: {
    readonly actionId: string;
    readonly turnId: string;
    readonly kind: RobotAdoptedAction;
    readonly weaponId?: string;
    readonly targetId?: string;
    readonly cell?: RobotPosition;
}): RobotBattleCoreState {
    if (!requireRobotBattleInput(s, input.actionId, input.turnId))
        return s;
    const u = source(s), o = getRobotAdoptedActionOptions(s, input.kind, input.weaponId);
    if (o.disabledReason || !((input.kind === "resupply-field" || input.kind === "tactical-decoy") ? input.cell && o.cells.some(c => sameRobotCoreCell(c, input.cell!)) : input.targetId && o.targetIds.includes(input.targetId)))
        throw new Error(o.disabledReason ?? "Legal addon target required");
    const duration = { ownerId: u.id, expiresOwnTurn: u.energy.ownTurn + 1 };
    if (input.kind === "tactical-marking-attack") {
        const w = resolveRobotBasicPart(input.weaponId!, u.parts.find(p => p.partId === input.weaponId)!.level);
        // Applied after the triggering attack, so this attack cannot consume its own new mark.
        return commitRobotBattleBatch(s, { actionId: input.actionId, turnId: input.turnId, summary: u.name + "：戦術標定攻撃", members: [{ unitId: u.id, action: { kind: "other", energyCost: o.energyCost } }], attacks: [s.units.some(v=>v.id===input.targetId) ? getRobotSpecialWeaponPacket(s, w.id, input.targetId!, input.actionId + ":mark", w.range!, .7) : getRobotSpecialFacilityPacket(s,u.id,w.id,input.targetId!,getRobotSpecialFacilityTargets(s,u.id,w.id,w.range!).find(t=>t.objectId===input.targetId)!.cell,input.actionId+":mark",w.range!,.7)], ...(s.units.some(v=>v.id===input.targetId)?{markTargetId:input.targetId!}:{}) });
    }
    let next: RobotBattleCoreState = { ...s, units: s.units.map(v => v.id === u.id ? { ...v, energy: commitRobotEnergyAction(v.energy, { kind: "other", energyCost: o.energyCost }) } : v) };
    let label = "";
    if (input.kind === "weakpoint-targeting") {
        const d = getRobotUnweakenedDefense(s, getRobotBattleUnit(s, input.targetId!));
        next = { ...next, units: next.units.map(v => v.id === input.targetId ? { ...v, weakpoint: { ...duration, amount: Math.floor(.25 * d + .30 * Math.max(0, d - 60)) } } : v) };
        label = "弱点照準";
    }
    else if (input.kind === "projected-defense") {
        next = { ...next, units: next.units.map(v => v.id === input.targetId ? { ...v, projectedDefense: duration } : v) };
        label = "防護投射（40%軽減）";
    }
    else if (input.kind === "tactical-decoy") {
        next = { ...next, decoys: [...(s.decoys ?? []).filter(d => d.ownerId !== u.id), { id: input.actionId + ":decoy", ownerId: u.id, cell: { ...input.cell! }, hp: 60, expiresOwnTurn: u.energy.ownTurn + 1 }] };
        label = "戦術デコイ";
    }
    else if (input.kind === "resupply-field") {
        next = { ...next, resupplyField: { id: input.actionId + ":field", ownerId: u.id, cell: { ...input.cell! }, placedRound: s.allied.round, expiresRound: s.allied.round + 1 } };
        label = "補給フィールド";
    }
    else {
        const target = getRobotBattleUnit(s, input.targetId!);
        next = { ...next, units: next.units.map(v => v.id === u.id ? { ...v, position: target.position } : v.id === target.id ? { ...v, position: u.position } : v) };
        for(const id of [u.id,target.id]){const moved=next.units.find(v=>v.id===id)!;if(moved.position)next=recordRobotEarlyEntry(next,id,moved.position);}
        next=applyRobotEarlyTeleportData(next,[u.id,target.id]);
        label = "戦術転送";
        // The current M30 objective is the only connected positional data objective.
        if (next.objective.kind === "m30" && !next.objective.state.data.sent) {
            const objectiveState = next.objective.state;
            let data = objectiveState.data;
            for (const id of [u.id, target.id]) {
                const v = getRobotBattleUnit(next, id);
                if (v.kind !== "controlled")
                    continue;
                if (data.cell && v.position && sameRobotCoreCell(data.cell, v.position) && v.carriedObjectiveId === null) {
                    data = { cell: null, carrierId: v.id, sent: false };
                    next = { ...next, units: next.units.map(w => w.id === v.id ? { ...w, carriedObjectiveId: ROBOT_M30_DATA_ID } : w) };
                }
                if (data.carrierId === v.id && v.position && sameRobotCoreCell(v.position, robotCellToPosition("I14"))) {
                    data = { cell: null, carrierId: null, sent: true };
                    next = { ...next, units: next.units.map(w => w.id === v.id ? { ...w, carriedObjectiveId: null } : w) };
                }
            }
            next = { ...next, objective: { kind: "m30", state: { ...objectiveState, data } } };
        }
    }
    const resolved = recordRobotBattleAction(finishRobotBattleTurn(next), input.actionId, u.name + "：" + label);
    const effect = input.kind === "weakpoint-targeting" ? "defense_down" : input.kind === "resupply-field" ? "heal" : input.kind === "tactical-teleport-beacon" ? "link_attack" : "defense_up";
    const cells = input.kind === "tactical-teleport-beacon" ? [u.position!, getRobotBattleUnit(s, input.targetId!).position!] : [input.cell ?? getRobotBattleUnit(s, input.targetId!).position!];
    return decodeRobotBattleCore({ ...resolved, latest: { ...resolved.latest!, supportCues: cells.map(cell => ({ cell: { ...cell }, effect })) } });
}
