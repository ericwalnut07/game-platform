import { consumeRobotMark } from "../../src/games/robot-tactics/adoptedEffects";
import { resolveRobotBasicPart } from "../../src/games/robot-tactics/equipment";
import { describe, it, expect } from "vitest";
import { remainingAddonScene as scene, alterRemainingUnit as alter, remainingBoss as boss } from "../robot-tactics/remainingAddonFixture";
import { beginRobotBattleTurn, commitRobotBattlePassive, decodeRobotBattleCore, getRobotBattleActor, getRobotBattleUnit as unit, getRobotBattleLegalMoves, robotBattleTurnId,configureRobotBattleAi, type RobotBattleCoreState } from "../../src/games/robot-tactics/battleState";
import { getRobotAdoptedActionOptions, commitRobotAdoptedAction, applyRobotAdoptedDebuffs } from "../../src/games/robot-tactics/adoptedEffects";
import { getRobotAfterAttackOptions, commitRobotAfterAttack } from "../../src/games/robot-tactics/afterAttack";
import { commitRobotBattleNormalAttack, commitRobotBattleSlashAttack, commitRobotBattleWeaponCombo, getRobotSpecialWeaponPacket } from "../../src/games/robot-tactics/battleWeaponActions";
import { commitRobotRemainingStrike } from "../../src/games/robot-tactics/remainingCombat";
import { getRobotBattleDefense, robotWeaponReaches, getRobotDamageFactors, getRobotUnweakenedDefense, applyRobotPhaseDamage, applyRobotReactions } from "../../src/games/robot-tactics/battleEffects";
import { commitRobotBattleBatch } from "../../src/games/robot-tactics/battleBatch";
import { getRobotDecoyCandidates } from "../../src/games/robot-tactics/decoys";
import { fixtureNextRound } from "../robot-tactics/coreFixture";
import { planRobotNpcTurn,commitRobotNpcTurn } from "../../src/games/robot-tactics/battleNpc";
import { getRobotSwordRecoil } from "../../src/games/robot-tactics/weaponActions";
import { projectRobotBattleCore } from "../../src/client/games/robot-tactics/BattleCoreView";
import { ROBOT_M30_DATA_ID } from "../../src/games/robot-tactics/m30Mission";
const id = (s: RobotBattleCoreState) => ({ actionId: "adopted-" + s.actionIds.length, turnId: robotBattleTurnId(s) });
const wait = (s: RobotBattleCoreState) => commitRobotBattlePassive(s, { ...id(s), kind: "wait" });
const special = (s: RobotBattleCoreState, kind: Parameters<typeof commitRobotAdoptedAction>[1]["kind"], targetId?: string, weaponId?: string, cell?: {
    x: number;
    y: number;
}) => commitRobotAdoptedAction(s, { ...id(s), kind, ...(targetId ? { targetId } : {}), ...(weaponId ? { weaponId } : {}), ...(cell ? { cell } : {}) });
const roundtrip = (s: RobotBattleCoreState) => expect(decodeRobotBattleCore(JSON.parse(JSON.stringify(s)))).toEqual(s);
function nearAlly(s: RobotBattleCoreState, id = "p2") { const p = unit(s, "p1").position!; const cells = Array.from({ length: 9 }, (_, i) => ({ x: p.x + i % 3 - 1, y: p.y + Math.floor(i / 3) - 1 })); const cell = cells.find(c => c.x >= 0 && c.y >= 0 && c.x < s.board.width && c.y < s.board.height && !s.board.walls.some(w => w.x === c.x && w.y === c.y) && !s.units.some(u => u.hp > 0 && u.position?.x === c.x && u.position.y === c.y)); if (!cell)
    throw new Error("fixture has no adjacent free cell"); return alter(s, id, { position: cell }); }
describe("adopted support states and shared damage", () => {
    it("weakpoint has EN10/action1, no HP damage, distance5+LOS, original DEF formula, independent additive debuffs", () => {
        let s = scene(["weakpoint-targeting"], "light-pistol", [{ x: 3, y: 0 }]);
        s = alter(s, boss, { weaponDebuffs: [{ stat: "def", delta: -8 }] });
        const target = unit(s, boss), d = getRobotUnweakenedDefense(s, target), amount = Math.floor(.25 * d + .3 * Math.max(0, d - 60));
        const after = special(s, "weakpoint-targeting", boss);
        expect(unit(after, boss).hp).toBe(target.hp);
        expect(after.latest!.damage).toEqual([]);
        expect(unit(after, boss).weakpoint).toEqual({ ownerId: "p1", expiresOwnTurn: 2, amount });
        expect(getRobotBattleDefense(after, unit(after, boss))).toBe(Math.max(10, d - 8 - amount));
        expect(unit(after, "p1").energy.action).toEqual({ kind: "other", energyCost: 10 });
        roundtrip(after);
    });
    it("weakpoint is one effect per enemy; new owner fully overwrites, distinct enemies persist until their own owner's next start", () => {
        let s = scene(["weakpoint-targeting"], "light-pistol", [{ x: 3, y: 0 }, { x: 4, y: 0 }]);
        const other = s.units.find(u => u.kind === "light")!;
        s = nearAlly(s);
        s = alter(s, "p2", { addons: [{ partId: "weakpoint-targeting" }] });
        let a = special(s, "weakpoint-targeting", boss);
        a = beginRobotBattleTurn(a, "p2");
        expect(getRobotAdoptedActionOptions(a, "weakpoint-targeting").targetIds).toContain(boss);
        a = special(a, "weakpoint-targeting", boss);
        expect(unit(a, boss).weakpoint?.ownerId).toBe("p2");
        a = fixtureNextRound(a);
        a = beginRobotBattleTurn(a, "p1");
        expect(unit(a, boss).weakpoint).toBeDefined();
        a = special(a, "weakpoint-targeting", other.id);
        expect(unit(a, other.id).weakpoint).toBeDefined();
        a = beginRobotBattleTurn(a, "p2");
        expect(unit(a, boss).weakpoint).toBeUndefined();
        expect(unit(a, other.id).weakpoint).toBeDefined();
        roundtrip(a);
    });
    it("weakpoint rejects range6, allies and malformed expiry without spending", () => {
        const s = scene(["weakpoint-targeting"], "light-pistol", [{ x: 6, y: 0 }]);
        expect(getRobotAdoptedActionOptions(s, "weakpoint-targeting").targetIds).not.toContain(boss);
        expect(() => special(s, "weakpoint-targeting", boss)).toThrow();
        expect(() => special(s, "weakpoint-targeting", "p2")).toThrow();
        expect(() => decodeRobotBattleCore({ ...s, units: s.units.map(u => u.id === boss ? { ...u, weakpoint: { ownerId: "p1", amount: 10, expiresOwnTurn: 99 } } : u) })).toThrow();
    });
    for (const [d, ignore] of [[40, .1], [60, .15], [80, .25], [100, .35], [110, .4], [120, .45], [200, .45]] as const)
        it(`focus DEF${d} uses ignore${ignore}, rate from unweakened DEF before any temporary reduction`, () => {
            let s = scene(["anti-materiel-focus"], "superheavy-railgun", [{ x: 3, y: 0 }]);
            const victim = s.units.find(u => u.kind === "light")!; // Trusted arithmetic fixture, boss base stats are immutable.
            const targetId = victim.id;
            s = { ...s, units: s.units.map(u => u.id === boss ? { ...u, position: victim.position } : u.id === targetId ? { ...u, position: unit(s, boss).position, stats: { ...u.stats, def: d }, weaponDebuffs: [{ stat: "def", delta: -8 }] } : u) };
            s = decodeRobotBattleCore(s);
            const expected = getRobotSpecialWeaponPacket(s, "superheavy-railgun", targetId, "preview", { min: 3, max: 5 }, 1.3, "normal", undefined, Number((1 - ignore).toFixed(12))).targets[0]!.resolution.damage;
            const after = commitRobotRemainingStrike(s, { ...id(s), kind: "anti-materiel-focus", weaponId: "superheavy-railgun", targetIds: [targetId] });
            expect(after.latest!.damage[0]!.damage).toBe(expected);
        });
    it("projected defense excludes self, includes AI, multiplies with guard and disappears at owner start", () => {
        let s = nearAlly(scene(["projected-defense"], "light-pistol", [{ x: 2, y: 0 }]));
        expect(getRobotAdoptedActionOptions(s, "projected-defense").targetIds).not.toContain("p1");
        expect(() => special(s, "projected-defense", "p1")).toThrow();
        let a = special(s, "projected-defense", "p2");
        a = alter(a, "p2", { defended: true, energy: { ...unit(a, "p2").energy, action: { kind: "other", energyCost: 0 }, ownTurn: 1 } });
        expect(getRobotDamageFactors(unit(a, "p2"))).toEqual([.8, .6]);
        a = fixtureNextRound(a);
        a = beginRobotBattleTurn(a, "p1");
        expect(unit(a, "p2").projectedDefense).toBeUndefined();
        roundtrip(a);
    });
    it("mark starts after70% initial attack, applies170% to first damaging combo hit only and consumes once", () => {
        let s = scene(["tactical-marking-attack"], "superheavy-railgun", [{ x: 3, y: 0 }]);
        let a = special(s, "tactical-marking-attack", boss, "superheavy-railgun");
        expect(unit(a, boss).tacticalMark).toBeDefined();
        a = beginRobotBattleTurn(a, "p2");
        // Controlled trusted packets simulate two hits with exact product operands, including fractional reductions.
        const base = 11, factors = [.8, .55], resolution = { damage: 4, damageBeforeMinimum: 4, reason: "hit" as const, product: { base, factors } };
        const attacks = [0, 1].map(i => ({ id: "mark-two:" + i, sourceId: "p2", effectKind: "slash" as const, targets: [{ entityId: boss, cells: [unit(a, boss).position!], resolution }] }));
        const after = commitRobotBattleBatch(a, { ...id(a), summary: "two hits", members: [{ unitId: "p2", action: { kind: "other", energyCost: 0 } }], attacks });
        expect(after.latest!.damage.map(e => e.damage)).toEqual([8, 4]);
        expect(unit(after, boss).tacticalMark).toBeUndefined();
        roundtrip(after);
    });
    it("mark does not amplify DOT or fuse and is consumed by the first friendly reaction", () => {
        let s = scene(["tactical-marking-attack"], "superheavy-railgun", [{ x: 3, y: 0 }]);
        let a = special(s, "tactical-marking-attack", boss, "superheavy-railgun");
        a = beginRobotBattleTurn(a, boss);
        const phase = applyRobotPhaseDamage(a, "p1", boss, 5, "testdot", "special:dot", "dot");
        expect(phase.event.damage).toBe(5);
        expect(unit(phase.state, boss).tacticalMark).toBeDefined();
        // A paid stance reacts without consuming another normal action; marked product is evaluated in the reaction resolver.
        const p1 = unit(a, "p1"), raw = { ...a, units: a.units.map(u => u.id === "p1" ? { ...u, overwatch: { weaponId: "superheavy-railgun", hitUnitIds: [], multiplier: .7 } } : u) };
        const marked = applyRobotReactions(raw, { kind: "move", unitId: boss }, "marked");
        expect(marked.events.some(e => e.sourceId === p1.id)).toBe(true);
        expect(unit(marked.state, boss).tacticalMark).toBeUndefined();
    });
    it("assault extension sets next+1 expiry and fully overwrites same-stat strength/lifetime, legacy unextended records remain valid", () => {
        const s = scene(["assault-debuff-extension"], "assault-rifle", [{ x: 2, y: 0 }]), target = unit(s, boss), source = unit(s, "p1");
        const mods = applyRobotAdoptedDebuffs({ ...target, weaponDebuffs: [{ stat: "spd", delta: -8 }] }, source, "assault-rifle", [{ stat: "spd", delta: -8 }]);
        expect(mods).toEqual([{ stat: "spd", delta: -8, untilOwnTurn: target.energy.ownTurn + 2 }]);
        const a = commitRobotBattleNormalAttack(s, { ...id(s), weaponId: "assault-rifle", targetId: boss });
        expect(unit(a, boss).weaponDebuffs?.[0]?.untilOwnTurn).toBe(2);
        const ended = wait(beginRobotBattleTurn(a, boss));
        expect(unit(ended, boss).weaponDebuffs).toBeDefined();
        const next = beginRobotBattleTurn(fixtureNextRound(ended), boss), closed = wait(next);
        expect(unit(closed, boss).weaponDebuffs).toBeUndefined();
        roundtrip(closed);
    });
});
describe("fields, decoys and atomic teleport", () => {
    it("resupply allows empty distance3, projects5x5, starts immediately and replaces team field until next round END", () => {
        const s = scene(["resupply-field"], "light-pistol", [{ x: 4, y: 0 }]), o = getRobotAdoptedActionOptions(s, "resupply-field"), cell = o.cells.find(c => Math.max(Math.abs(c.x - unit(s, "p1").position!.x), Math.abs(c.y - unit(s, "p1").position!.y)) === 2)!;
        let a = special(s, "resupply-field", undefined, undefined, cell);
        expect(a.resupplyField).toMatchObject({ placedRound: 1, expiresRound: 2, cell });
        expect(unit(a, "p1").energy.action?.energyCost).toBe(20);
        expect(unit(a, "p1").energy.en).toBeGreaterThanOrEqual(unit(s, "p1").energy.en - 20 + 12);
        a = fixtureNextRound(a);
        expect(a.resupplyField).toBeDefined();
        a = fixtureNextRound(a);
        expect(a.resupplyField).toBeUndefined();
        roundtrip(a);
    });
    it("decoy is HP60/DEF60, blocks both teams' movement, not LOS, replaces owner copy, expires owner next start", () => {
        const s = scene(["tactical-decoy"], "light-pistol", [{ x: 2, y: 0 }]), cell = getRobotAdoptedActionOptions(s, "tactical-decoy").cells[0]!;
        let a = special(s, "tactical-decoy", undefined, undefined, cell);
        expect(a.decoys?.[0]?.hp).toBe(60);
        expect(projectRobotBattleCore(a, { battleId: a.id, sequence: 1 }).structures.find(d => d.id === a.decoys![0]!.id)?.def).toBe(60);
        a = beginRobotBattleTurn(a, "p2");
        expect(getRobotBattleLegalMoves(a, "p2").some(m => m.destination.x === cell.x && m.destination.y === cell.y)).toBe(false);
        a = wait(a);
        a = fixtureNextRound(a);
        a = beginRobotBattleTurn(a, "p1");
        expect(a.decoys).toEqual([]);
        roundtrip(a);
    });
    it("enemy can attack and destroy decoy without mission damage, kill EN or duplicate HP entities", () => {
        const s = scene(["tactical-decoy"], "light-pistol", [{ x: 2, y: 0 }]), enemy = unit(s, boss), cell = getRobotAdoptedActionOptions(s, "tactical-decoy").cells.find(c => Math.max(Math.abs(c.x - enemy.position!.x), Math.abs(c.y - enemy.position!.y)) === 1)!;
        let a = special(s, "tactical-decoy", undefined, undefined, cell);
        a = beginRobotBattleTurn(a, boss);
        const weapon = unit(a, boss).parts.find(p => getRobotDecoyCandidates(a, boss, p.partId, "decoy-hit").length);
        expect(weapon).toBeDefined();
        const candidate = getRobotDecoyCandidates(a, boss, weapon!.partId, "decoy-hit")[0]!;
        const after = commitRobotBattleBatch(a, { ...id(a), summary: "decoy", members: [{ unitId: boss, action: { kind: "normal-attack", energyCost: candidate.cost } }], attacks: [candidate.packet] });
        expect(after.decoys?.[0]?.hp ?? 0).toBe(Math.max(0, 60 - candidate.packet.targets[0]!.resolution.damage));
        expect(after.latest!.decoyTargets).toHaveLength(1);
        expect(unit(after, boss).energy.killRecovered).toBe(false);
        roundtrip(after);
    });
    it("teleport uses EN0+one action, swaps friendly AI simultaneously without normal movement EN, no movement reaction", () => {
        const s = nearAlly(scene(["tactical-teleport-beacon"], "light-pistol", [{ x: 2, y: 0 }], 0)), o = getRobotAdoptedActionOptions(s, "tactical-teleport-beacon"), targetId = o.targetIds[0]!;
        expect(o.disabledReason).toBeNull();
        const before = unit(s, targetId), a = special(s, "tactical-teleport-beacon", targetId);
        expect(unit(a, "p1").position).toEqual(before.position);
        expect(unit(a, targetId).position).toEqual(unit(s, "p1").position);
        expect(unit(a, targetId).energy).toEqual(before.energy);
        expect(unit(a, "p1").energy.moved).toBe(false);
        expect(unit(a, "p1").energy.action).toEqual({ kind: "other", energyCost: 0 });
        expect(a.latest!.damage).toEqual([]);
        roundtrip(a);
    });
    it("teleport preserves carried data owner and triggers transmit only at I14", () => {
        let s = scene(["tactical-teleport-beacon"], "light-pistol", [{ x: 2, y: 0 }]);
        if (s.objective.kind !== "m30")
            throw new Error();
        const carrier = "p2", origin = unit(s, "p1").position!, destination = { x: 8, y: 13 };
        const p2 = unit(s, carrier);
        s = decodeRobotBattleCore({ ...s, units: s.units.map(u => u.id === "p1" ? { ...u, position: destination } : u.id === carrier ? { ...u, carriedObjectiveId: ROBOT_M30_DATA_ID, position: { x: 8, y: 12 } } : u.position?.x === 8 && u.position.y === 13 ? { ...u, position: origin } : u), objective: { kind: "m30", state: { ...s.objective.state, data: { cell: null, carrierId: carrier, sent: false } } } });
        expect(p2.id).toBe(carrier);
        const a = special(s, "tactical-teleport-beacon", carrier);
        expect(a.objective.kind === "m30" && a.objective.state.data.sent).toBe(true);
        expect(unit(a, carrier).carriedObjectiveId).toBeNull();
        expect(unit(a, "p1").carriedObjectiveId).toBeNull();
        roundtrip(a);
    });
    it("declines illegal/support/occupied placement without any EN or action mutation", () => {
        const s = scene(["resupply-field"], "light-pistol", [{ x: 2, y: 0 }], 19), raw = JSON.stringify(s);
        expect(() => special(s, "resupply-field", undefined, undefined, unit(s, "p1").position!)).toThrow();
        expect(JSON.stringify(s)).toBe(raw);
    });
});
describe("post-attack continuations", () => {
    function sword() { let s = scene(["slash-followthrough", "melee-slash-through", "chain-slash-reactor"], "double-edged-sword", [{ x: 1, y: 0 }, { x: 1, y: 1 }]); s = alter(s, boss, { hp: 1 }); return s; }
    it("main attack resolves first, two addon steps save independently, no second action/move EN, optional termination", () => {
        const s = sword();
        let a = commitRobotBattleNormalAttack(s, { ...id(s), weaponId: "double-edged-sword", targetId: boss });
        expect(unit(a, boss).hp).toBe(0);
        expect(a.turn.actorId).toBe("p1");
        expect(a.afterAttack?.moves).toEqual(["slash-followthrough", "melee-slash-through"]);
        roundtrip(a);
        expect(() => wait(a)).toThrow(/post-attack/);
        for (let n = 0; n < 2; n++) {
            const before = unit(a, "p1").energy.en, m = getRobotAfterAttackOptions(a).moves[0]!;
            a = commitRobotAfterAttack(a, { ...id(a), kind: "post-move", destination: m.destination });
            expect(unit(a, "p1").energy.en).toBe(before);
            roundtrip(a);
        }
        expect(a.afterAttack?.moves).toEqual([]);
        expect(a.afterAttack?.chainWeaponIds).toEqual(["double-edged-sword"]);
        const after = commitRobotAfterAttack(a, { ...id(a), kind: "post-skip" });
        expect(after.afterAttack).toBeUndefined();
        expect(after.turn.actorId).toBeNull();
        expect(unit(after, "p1").energy.action?.energyCost).toBe(0);
        roundtrip(after);
    });
    it("chain spends EN15 only on choice, normal100% plus actual damage20% sword recoil, cannot chain again", () => {
        let s = sword();
        s = alter(s, "p1", { addons: [{ partId: "chain-slash-reactor" }] });
        let a = commitRobotBattleNormalAttack(s, { ...id(s), weaponId: "double-edged-sword", targetId: boss });
        const choice = getRobotAfterAttackOptions(a).targets[0]!;
        expect(choice).toBeDefined();
        const before = unit(a, "p1"), target = unit(a, choice.targetId);
        const after = commitRobotAfterAttack(a, { ...id(a), kind: "chain-followup", weaponId: choice.weaponId, targetId: choice.targetId });
        const damage = after.latest!.damage.find(e => e.targetId === target.id)!.damage!;
        expect(after.latest!.damage.filter(e => e.effectKind === "special:sword-recoil").reduce((n, e) => n + (e.damage ?? 0), 0)).toBe(getRobotSwordRecoil({ attack: "normal", attackWeaponIds: [choice.weaponId], actingAsSupporter: false, actualHpDamage: [Math.min(target.hp, damage)] }));
        expect(unit(after, "p1").energy.action).toEqual(before.energy.action);
        expect(after.afterAttack).toBeUndefined();
        expect(unit(after, "p1").energy.en).toBeLessThanOrEqual(before.energy.en - 15 + 24);
        roundtrip(after);
    });
    it("chain can be declined with insufficient EN; no charge and no second action", () => {
        let s = sword();
        s = alter(s, "p1", { addons: [{ partId: "chain-slash-reactor" }], energy: { ...unit(s, "p1").energy, en: 0 } });
        let a = commitRobotBattleNormalAttack(s, { ...id(s), weaponId: "double-edged-sword", targetId: boss });
        a = alter(a, "p1", { energy: { ...unit(a, "p1").energy, en: 14 } });
        expect(getRobotAfterAttackOptions(a).targets).toEqual([]);
        const raw = JSON.stringify(a);
        expect(() => commitRobotAfterAttack(a, { ...id(a), kind: "chain-followup", weaponId: "double-edged-sword", targetId: a.units.find(u => u.kind === "light")!.id })).toThrow();
        expect(JSON.stringify(a)).toBe(raw);
        expect(commitRobotAfterAttack(a, { ...id(a), kind: "post-skip" }).turn.actorId).toBeNull();
    });
    it("sweep enables only slash-followthrough, combo kill enables chain but neither normal-only movement", () => {
        let s = sword();
        let sweep = commitRobotBattleSlashAttack(s, { ...id(s), weaponId: "double-edged-sword", kind: "sweep", targetIds: [boss] });
        expect(sweep.afterAttack?.moves).toEqual(["slash-followthrough"]);
        const other = s.units.find(u => u.kind === "light")!.id;
        const combo = commitRobotBattleWeaponCombo(s, { ...id(s), primaryWeaponId: "double-edged-sword", secondaryWeaponId: "light-pistol", targetIds: [boss, other] });
        expect(combo.afterAttack?.moves).toEqual([]);
        expect(combo.afterAttack?.chainWeaponIds).toEqual(["double-edged-sword"]);
    });
    it("no new subphase after a non-kill/no eligible equipment and rejects forged continuation", () => {
        const s = scene([], "light-pistol", [{ x: 2, y: 0 }]), a = commitRobotBattleNormalAttack(s, { ...id(s), weaponId: "light-pistol", targetId: boss });
        expect(a.afterAttack).toBeUndefined();
        expect(() => decodeRobotBattleCore({ ...s, afterAttack: { ownerId: "p1", moves: ["slash-followthrough"], usedMoves: [], chainWeaponIds: [], chainUsed: false } })).toThrow();
    });
    it("NPC planner still processes adopted reactions/standard turn choices with these states", () => {
        let s = scene(["tactical-marking-attack"], "superheavy-railgun", [{ x: 3, y: 0 }]);
        s = special(s, "tactical-marking-attack", boss, "superheavy-railgun");
        s = beginRobotBattleTurn(s, boss);
        expect(planRobotNpcTurn(s).choices.length).toBe(1);
        expect(getRobotBattleActor(s).id).toBe(boss);
    });
});
it("marks expire at their owner's next start and are not consumed by non-damaging packets", () => {
    let s = scene(["tactical-marking-attack"], "precision-rifle", [{ x: 3, y: 0 }]);
    s = special(s, "tactical-marking-attack", boss, "precision-rifle");
    s = beginRobotBattleTurn(s, "p2");
    const after = commitRobotBattleBatch(s, { ...id(s), summary: "non-damaging", members: [{ unitId: "p2", action: { kind: "other", energyCost: 0 } }], attacks: [{ id: "no-hit", sourceId: "p2", effectKind: "sniper", targets: [{ entityId: boss, cells: [unit(s, boss).position!], resolution: { damage: 0, damageBeforeMinimum: null, reason: "non-damaging" } }] }] });
    expect(unit(after, boss).tacticalMark).toBeDefined();
    const next = beginRobotBattleTurn(fixtureNextRound(after), "p1");
    expect(unit(next, boss).tacticalMark).toBeUndefined();
});
it("an optional one-step landing triggers interception before the next optional step and stops if the mover is defeated", () => {
    let s = scene(["slash-followthrough", "melee-slash-through"], "double-edged-sword", [{ x: 1, y: 0 }, { x: 3, y: 0 }]);
    const enemy = s.units.find(u => u.kind === "light")!, origin = unit(s, "p1").position!;
    s = alter(s, boss, { hp: 1 });
    s = alter(s, "p1", { hp: 1 });
    s = alter(s, enemy.id, { parts: [{ partId: "light-lance", level: 1 }], addons: [{ partId: "thrust-interception" }] });
    const a = commitRobotBattleNormalAttack(s, { ...id(s), weaponId: "double-edged-sword", targetId: boss });
    expect(a.afterAttack?.moves).toHaveLength(2);
    const after = commitRobotAfterAttack(a, { ...id(a), kind: "post-move", destination: { x: origin.x + 1, y: origin.y } });
    expect(unit(after, "p1").hp).toBe(0);
    expect(after.afterAttack).toBeUndefined();
    expect(after.turn.actorId).toBeNull();
    expect(after.latest!.damage.some(e => e.sourceId === enemy.id)).toBe(true);
    roundtrip(after);
});
for (const distance of [2, 3])
    it(`chain follow-up respects distance${distance} charge steps, does not grant ordinary-move recovery or bypass occupancy`, () => {
        let s = scene(["chain-slash-reactor", ...(distance === 3 ? ["super-charge-thruster"] : [])], "double-edged-sword", [{ x: 1, y: 0 }, { x: distance, y: 1 }]);
        s = alter(s, boss, { hp: 1 });
        s = alter(s, "p1", { energy: { ...unit(s, "p1").energy, moved: true } });
        const a = commitRobotBattleNormalAttack(s, { ...id(s), weaponId: "double-edged-sword", targetId: boss }), target = a.units.find(u => u.kind === "light")!, o = getRobotAfterAttackOptions(a), choice = o.targets.find(t => t.targetId === target.id);
        expect(choice?.landing).toBeDefined();
        const landing = choice!.landing!;
        const blocked = alter(a, "p2", { position: landing });
        expect(getRobotAfterAttackOptions(blocked).targets.some(t => t.targetId === target.id)).toBe(false);
        const after = commitRobotAfterAttack(a, { ...id(a), kind: "chain-followup", weaponId: choice!.weaponId, targetId: target.id });
        expect(unit(after, "p1").position).toEqual(landing);
        expect(unit(after, "p1").energy.usedExtraMove).toBe(true);
        expect(unit(after, "p1").energy.action).toEqual(unit(a, "p1").energy.action);
        roundtrip(after);
    });
it("decoy disappears on owner defeat without changing the defeated unit's respawn handling", () => {
    let s = scene(["tactical-decoy"], "light-pistol", [{ x: 2, y: 0 }]);
    s = special(s, "tactical-decoy", undefined, undefined, getRobotAdoptedActionOptions(s, "tactical-decoy").cells[0]!);
    s = beginRobotBattleTurn(s, boss);
    const after = commitRobotBattleBatch(s, { ...id(s), summary: "owner defeated", members: [{ unitId: boss, action: { kind: "normal-attack", energyCost: 0 } }], attacks: [{ id: "owner-kill", sourceId: boss, effectKind: "blunt", targets: [{ entityId: "p1", cells: [unit(s, "p1").position!], resolution: { damage: unit(s, "p1").hp, damageBeforeMinimum: unit(s, "p1").hp, reason: "hit" } }] }] });
    expect(after.decoys).toEqual([]);
    expect(after.allied.waiting.some(u => u.unitId === "p1")).toBe(true);
    roundtrip(after);
});
it("decoy is not a LOS blocker in the common attack query", () => {
    let s = scene(["tactical-decoy"], "superheavy-railgun", [{ x: 3, y: 0 }]);
    const p = unit(s, "p1").position!, cell = { x: p.x + 1, y: p.y };
    s = special(s, "tactical-decoy", undefined, undefined, cell);
    const source = unit(s, "p1"), target = unit(s, boss);
    expect(robotWeaponReaches(s, source, target, resolveRobotBasicPart("superheavy-railgun", 1))).toBe(true);
    expect(s.decoys).toHaveLength(1);
});

it("amplified overwatch saves the adopted total EN25 rather than the withdrawn EN40",async()=>{
 const {commitRobotActiveCombat}=await import("../../src/games/robot-tactics/activeCombat");const s=scene(["overwatch-amplifier"],"corrosion-rifle",[{x:2,y:0}]);const after=commitRobotActiveCombat(s,{...id(s),kind:"overwatch",weaponId:"corrosion-rifle",targetIds:[]});expect(unit(after,"p1").overwatch?.multiplier).toBe(.9);expect(unit(after,"p1").energy.action?.energyCost).toBe(25);roundtrip(after);
});

it("friendly AI scores and commits the same first marked hit without consuming the mark during planning",()=>{
 let s=scene(["tactical-marking-attack"],"precision-rifle",[{x:3,y:0}]);s=special(s,"tactical-marking-attack",boss,"precision-rifle");const source=unit(s,"p1"),friend=unit(s,"f1");
 s=decodeRobotBattleCore({...s,units:s.units.map(u=>u.id==="f1"?{...u,position:source.position,parts:[{partId:"precision-rifle",level:1},{partId:"light-pistol",level:1}]}:u.id==="p1"?{...u,position:friend.position}:u)});
 s=configureRobotBattleAi(s,{kind:"instruction",unitId:"f1",instruction:{tacticId:"focus-attack",targetUnitId:boss}});s=beginRobotBattleTurn(s,"f1");s=alter(s,"f1",{energy:{...unit(s,"f1").energy,moved:true}});
 const plan=planRobotNpcTurn(s),candidate=plan.choices[0]!.attack!;expect(candidate.packet.targets[0]!.entityId).toBe(boss);const marked=consumeRobotMark(s,unit(s,"f1"),unit(s,boss),candidate.packet.targets[0]!.resolution,new Set());expect(candidate.score).toBe(10000+(marked>=unit(s,boss).hp?1000:0)+Math.min(marked,unit(s,boss).hp));expect(unit(s,boss).tacticalMark).toBeDefined();
 const after=commitRobotNpcTurn(s,id(s));expect(after.latest!.damage.find(e=>e.sourceId==="f1"&&e.targetId===boss)?.damage).toBe(marked);expect(unit(after,boss).tacticalMark).toBeUndefined();roundtrip(after);
});
