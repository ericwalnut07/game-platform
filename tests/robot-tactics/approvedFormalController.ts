/** Earned builds and legal inputs only; production M01, AI and saves remain authoritative. */
import { offlineAddonFixtureProgress } from "./offlineAddonFixture";
import { applyRobotCustomization } from "../../src/games/robot-tactics/customization";
import { getRobotAdoptedActionOptions } from "../../src/games/robot-tactics/adoptedEffects";
import { getRobotAfterAttackOptions } from "../../src/games/robot-tactics/afterAttack";
import { getRobotBattleActor, getRobotBattleLegalMoves, getRobotBattleUnit, type RobotBattleCoreState } from "../../src/games/robot-tactics/battleState";
import { getRobotBattleNormalAttackOptions } from "../../src/games/robot-tactics/battleWeaponActions";
import type { RobotJson } from "../../src/games/robot-tactics/offlineSession";
export const approvedFormalCases = ["tactical-marking-attack", "projected-defense", "weakpoint-targeting", "resupply-field", "tactical-teleport-beacon", "tactical-decoy", "assault-debuff-extension", "post-moves", "chain-slash-reactor"] as const;
export type ApprovedFormalCase = typeof approvedFormalCases[number];
export const approvedCaseWeapon = (kind: ApprovedFormalCase) => kind === "post-moves" || kind === "chain-slash-reactor" ? "double-edged-sword" : kind === "tactical-marking-attack" ? "precision-rifle" : "corrosion-rifle";
export function approvedFormalProgress(kind: ApprovedFormalCase) {
    let p = offlineAddonFixtureProgress(), weapon = approvedCaseWeapon(kind);
    const c = p.party[2]!;
    if (![c.basic.weapon1.partId, c.basic.weapon2.partId].includes(weapon))
        p = applyRobotCustomization(p, { kind: "part-equip", coreId: "core-c", slot: "weapon2", partId: weapon });
    for (const partId of kind === "post-moves" ? ["slash-followthrough", "melee-slash-through"] : [kind])
        p = applyRobotCustomization(p, { kind: "addon-equip", coreId: "core-c", partId });
    return p;
}
export function approvedFormalAction(s: RobotBattleCoreState, kind: ApprovedFormalCase): RobotJson {
    const u = getRobotBattleUnit(s, getRobotBattleActor(s).unitIds[0]!);
    if (u.kind !== "controlled")
        return { kind: "npc" };
    if (u.id !== "core-c")
        return { kind: "charge" };
    if (s.afterAttack) {
        const o = getRobotAfterAttackOptions(s);
        if (o.moves.length)
            return { kind: "post-move", destination: { ...o.moves[0]!.destination } };
        if (o.targets.length)
            return { kind: "chain-followup", weaponId: o.targets[0]!.weaponId, targetId: o.targets[0]!.targetId };
        return { kind: "post-skip" };
    }
    const weaponId = approvedCaseWeapon(kind), normal = kind === "post-moves" || kind === "chain-slash-reactor" || kind === "assault-debuff-extension";
    if (!normal) {
        const o = getRobotAdoptedActionOptions(s, kind, weaponId);
        if (o.targetIds.length)
            return { kind, weaponId, targetId: o.targetIds[0]! };
        if (o.cells.length) {
            const cell = o.cells.find(c => Math.max(Math.abs(c.x - u.position!.x), Math.abs(c.y - u.position!.y)) <= 1) ?? o.cells[0]!;
            return { kind, cell: { ...cell } };
        }
    }
    else {
        const o = getRobotBattleNormalAttackOptions(s, weaponId);
        if (o.targetIds.length)
            return { kind: "normal", weaponId, targetId: o.targetIds[0]! };
    }
    if (!u.energy.moved) {
        const moves = getRobotBattleLegalMoves(s, u.id);
        const targets = (v: RobotBattleCoreState) => normal ? getRobotBattleNormalAttackOptions(v, weaponId).targetIds : getRobotAdoptedActionOptions(v, kind, weaponId).targetIds;
        const best = moves.find(m => targets({ ...s, units: s.units.map(v => v.id === u.id ? { ...v, position: m.destination, energy: { ...v.energy, moved: true } } : v) }).length);
        if (best)
            return { kind: "move", destination: { ...best.destination } };
        const enemies = s.units.filter(v => v.hp > 0 && v.kind !== "controlled" && v.kind !== "friendly-ai" && v.position), distance = (c: {
            x: number;
            y: number;
        }) => Math.min(...enemies.map(v => Math.max(Math.abs(v.position!.x - c.x), Math.abs(v.position!.y - c.y))));
        const closest = [...moves].sort((a, b) => distance(a.destination) - distance(b.destination))[0];
        if (closest && distance(closest.destination) < distance(u.position!))
            return { kind: "move", destination: { ...closest.destination } };
    }
    return { kind: "charge" };
}
