/** Non-unit HP entities: block movement, do not block LOS or occupy initiative. */
import { checkRobotAttackRange } from "./attackRange";
import { checkRobotAttackSpatial, resolveRobotTargetDamage } from "./attackResolution";
import { getRobotWeaponDamageEstimate } from "./combatMath";
import { getRobotNormalActionCost } from "./combatAddons";
import { getRobotActionEnergyBlock } from "./energy";
import { resolveRobotBasicPart } from "./equipment";
import { getRobotBattleActor, getRobotBattleCommandBonus, getRobotBattleEffectiveStats, getRobotBattleFacilities, getRobotBattleUnit, robotBattleIsAlly, sameRobotCoreCell, type RobotBattleCoreState } from "./battleState";
import type { RobotPosition } from "./movement";
import type { RobotBattleResolvedAttack } from "./battleBatch";
export interface RobotDecoy {
    readonly id: string;
    readonly ownerId: string;
    readonly cell: RobotPosition;
    readonly hp: number;
    readonly expiresOwnTurn: number;
}
export function getRobotBattleAttackObjects(s: RobotBattleCoreState) { return [...getRobotBattleFacilities(s), ...(s.decoys ?? []).map(d => ({ id: d.id, cells: [d.cell], hp: d.hp, maxHp: 60, def: 60 }))]; }
export function getRobotDecoyCandidates(s: RobotBattleCoreState, sourceId: string, weaponId: string, attackId: string) {
    const source = getRobotBattleUnit(s, sourceId), selected = source.parts.find(p => p.partId === weaponId);
    if (!selected || robotBattleIsAlly(source) || !getRobotBattleActor(s).unitIds.includes(sourceId))
        return [];
    const weapon = resolveRobotBasicPart(weaponId, selected.level), energyCost = getRobotNormalActionCost(selected, source.addons);
    if (weapon.slot !== "weapon" || !weapon.range || getRobotActionEnergyBlock(source.energy, energyCost))
        return [];
    return (s.decoys ?? []).flatMap(d => {
        const spatial = checkRobotAttackSpatial({ kind: "normal", range: checkRobotAttackRange({ origin: source.position!, target: d.cell, ...weapon.range! }), sight: { board: s.board, origin: source.position!, target: d.cell } });
        if (!spatial.canReach)
            return [];
        const bonus = getRobotBattleCommandBonus(s, source.id, d.id), stats = getRobotBattleEffectiveStats(source), base = getRobotWeaponDamageEstimate({ weaponId, weaponLevel: selected.level, attackStats: { melee: stats.melee + bonus.melee, ranged: stats.ranged + bonus.ranged }, targetDef: 60, mode: "normal" }).baseDamage;
        const packet: RobotBattleResolvedAttack = { id: attackId, sourceId, effectKind: weapon.weaponFamily as RobotBattleResolvedAttack["effectKind"], targets: [{ entityId: d.id, cells: [d.cell], resolution: resolveRobotTargetDamage({ attackLegal: true, spatial, effect: { kind: "damaging", resolveAfterModifiers: () => base } }) }] };
        return [{ packet, weaponId, cost: energyCost, score: 100 + Math.min(d.hp, packet.targets[0]!.resolution.damage) }];
    });
}
export function assertRobotDecoys(s: RobotBattleCoreState): void {
    const decoys = s.decoys;
    if (decoys === undefined)
        return;
    if (!Array.isArray(decoys) || decoys.length > 3 || new Set(decoys.map(d => d.id)).size !== decoys.length || new Set(decoys.map(d => d.ownerId)).size !== decoys.length || new Set(decoys.map(d => d.cell.x + "," + d.cell.y)).size !== decoys.length)
        throw new Error("Invalid decoy set");
    for (const d of decoys) {
        const u = s.units.find(u => u.id === d.ownerId);
        if (!u || u.kind !== "controlled" || u.hp === 0 || !u.addons?.some(a => a.partId === "tactical-decoy") || !d.id || s.units.some(u => u.id === d.id) || getRobotBattleFacilities(s).some(f => f.id === d.id || f.cells.some(c => sameRobotCoreCell(c, d.cell))) || !Number.isSafeInteger(d.hp) || d.hp < 1 || d.hp > 60 || d.expiresOwnTurn !== u.energy.ownTurn + 1 || !Number.isSafeInteger(d.cell.x) || !Number.isSafeInteger(d.cell.y) || d.cell.x < 0 || d.cell.y < 0 || d.cell.x >= s.board.width || d.cell.y >= s.board.height || s.board.walls.some(c => sameRobotCoreCell(c, d.cell)) || s.units.some(u => u.hp > 0 && u.position && sameRobotCoreCell(u.position, d.cell)))
            throw new Error("Invalid decoy snapshot");
    }
}
