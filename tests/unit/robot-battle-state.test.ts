import { describe, expect, it } from "vitest";
import { advanceRobotBattleRound, beginRobotBattleTurn, commitRobotBattleBossCommand, commitRobotBattleData, commitRobotBattlePassive, configureRobotBattleAi, decodeRobotBattleCore, getRobotBattleCommandBonus, getRobotBattleResult, getRobotBattleUnit, getRobotBattleStructures, inspectRobotBattleInitiative, moveRobotBattleUnit, robotBattleTurnId, type RobotBattleCoreState } from "../../src/games/robot-tactics/battleState";
import { commitRobotBattleBatch } from "../../src/games/robot-tactics/battleBatch";
import { getRobotEnergyRecoveryAmounts } from "../../src/games/robot-tactics/energy";
import { getRobotLegalMoves, robotCellToPosition } from "../../src/games/robot-tactics/movement";
import { coreFixture, fixtureAttack, fixtureCloseRound, fixtureCommit, fixtureDamage, fixtureNextRound, fixtureWave } from "../robot-tactics/coreFixture";

const u = getRobotBattleUnit;
const open = (s = coreFixture(), id = "p1") => beginRobotBattleTurn(s, id);
const input = (s: RobotBattleCoreState, actionId = "action") => ({ actionId, turnId: robotBattleTurnId(s) });
const squad = (s: RobotBattleCoreState) => s.actors.find(a => a.unitIds.length === 3)!;
const hp = (s: RobotBattleCoreState, id: string, value: number) => decodeRobotBattleCore({ ...s, units: s.units.map(unit => unit.id === id ? { ...unit, hp: value } : unit) });

describe("connected turn, movement and resource ledger", () => {
  it("copies a trusted roster and preserves adopted equipment/boss values without double HP or penalties", () => {
    const normal = coreFixture(30), hard = coreFixture(30, "hard");
    expect(u(normal, "enemy-supreme-commander")).toMatchObject({ hp: 395, maxHp: 395, stats: { mov: 2, spd: 97, def: 85 } });
    expect(u(hard, "enemy-supreme-commander")).toMatchObject({ hp: 550, energy: { maxEn: 465 }, stats: { spd: 122 } });
    expect(u(coreFixture(), "p1").maxHp).toBe(55);
    const copy = decodeRobotBattleCore(normal); expect(copy).toEqual(normal); expect(copy.units).not.toBe(normal.units);
  });
  it("commits one legal move before an action, recovers EN once and refuses stale/occupied/duplicate movement", () => {
    let s = open(); const before = s, unit = u(s, "p1");
    const move = getRobotLegalMoves({ ...unit.movement!, board: s.board, origin: unit.position!, occupied: s.units.filter(a => a.id !== unit.id).map(a => a.position!), structures: [] })[0]!;
    expect(() => moveRobotBattleUnit(s, { ...input(s), unitId: "p1", destination: u(s, "p2").position! })).toThrow();
    s = moveRobotBattleUnit(s, { ...input(s, "move"), unitId: "p1", destination: move.destination });
    expect(u(s, "p1").energy.en).toBe(unit.energy.en + 3); expect(s.turn.actorId).toBe("p1");
    expect(moveRobotBattleUnit(s, { ...input(before, "move"), unitId: "p1", destination: move.destination })).toBe(s);
    expect(() => moveRobotBattleUnit(s, { ...input(s, "twice"), unitId: "p1", destination: unit.position! })).toThrow();
    s = commitRobotBattlePassive(s, { ...input(s), kind: "wait" }); expect(s.turn.actorId).toBeNull();
    expect(() => commitRobotBattlePassive(s, { ...input(s, "another"), kind: "wait" })).toThrow();
    expect(() => beginRobotBattleTurn(s, "p1")).toThrow(); expect(before.actionIds).toEqual([]);
  });
  it("closes all three squad members once, with one initiative slot and no light charge", () => {
    const initial = coreFixture(), actor = squad(initial), s = open(initial, actor.id), before = JSON.stringify(s);
    expect(() => commitRobotBattlePassive(s, { ...input(s), kind: "charge" })).toThrow();
    const after = fixtureCommit(s, actor.unitIds.map((id, i) => fixtureAttack(s, id, "p" + (i + 1), 1, "hit" + i)));
    expect(after.turn.actedActorIds).toEqual([actor.id]);
    for (const id of actor.unitIds) expect(u(after, id).energy).toMatchObject({ ownTurn: 1, turnOpen: false, normalHitRecovered: true });
    expect(JSON.stringify(s)).toBe(before);
  });
  it("applies minimum 1 after final zero while invalid/blocked/non-damaging effects never become damage", () => {
    const s = open(), targetId = squad(s).unitIds[0]!, hit = fixtureAttack(s, "p1", targetId, 0);
    expect(fixtureCommit(s, [hit]).units.find(v => v.id === targetId)!.hp).toBe(u(s, targetId).hp - 1);
    for (const reason of ["invalid-attack", "out-of-range", "range-unresolved", "line-of-sight-blocked"] as const) {
      const attack = { ...hit, targets: hit.targets.map(t => ({ ...t, resolution: { reason, damage: 0, damageBeforeMinimum: null } })) };
      expect(() => fixtureCommit(s, [attack])).toThrow(/non-established/);
    }
    const nonDamage = { ...hit, targets: hit.targets.map(t => ({ ...t, resolution: { reason: "non-damaging" as const, damage: 0, damageBeforeMinimum: null } })) };
    const after = commitRobotBattleBatch(s, { ...input(s), summary: "non-damaging effect", attacks: [nonDamage], members: [{ unitId: "p1", action: { kind: "other", energyCost: 0 } }] });
    expect(u(after, targetId).hp).toBe(u(s, targetId).hp); expect(after.latest!.damage[0]!.damage).toBeNull();
    expect(u(after, "p1").energy.normalHitRecovered).toBe(false);
  });
  it("does not partially spend EN/HP for bad member lists, targets, duplicate hits or insufficient EN", () => {
    const s = open(), attack = fixtureAttack(s, "p1", squad(s).unitIds[0]!, 5), before = JSON.stringify(s);
    const base = { ...input(s), summary: "attack", attacks: [attack], members: [{ unitId: "p1", action: { kind: "normal-attack" as const, energyCost: 0 } }] };
    for (const changed of [{ members: [] }, { attacks: [attack, attack] }, { attacks: [{ ...attack, targets: [...attack.targets, ...attack.targets] }] }, { members: [{ unitId: "p1", action: { kind: "normal-attack" as const, energyCost: 9999 } }] }]) expect(() => commitRobotBattleBatch(s, { ...base, ...changed })).toThrow();
    expect(JSON.stringify(s)).toBe(before);
  });
  it("recovers normal-hit/kill only once per own turn, damage only once per round, and rejects replay", () => {
    let s = open(); const targetIds = squad(s).unitIds.slice(0, 2), initial = u(s, "p1").energy;
    const hit = { ...fixtureAttack(s, "p1", targetIds[0]!, 100), targets: targetIds.map(entityId => ({ entityId, cells: [u(s, entityId).position!], resolution: fixtureDamage(100) })) };
    const originalAction = { ...input(s, "kill"), summary: "fixture resolved attack", attacks: [hit], members: [{ unitId: "p1", action: { kind: "normal-attack" as const, energyCost: 0 } }] };
    s = commitRobotBattleBatch(s, originalAction);
    const amounts = getRobotEnergyRecoveryAmounts(initial.maxEn);
    expect(u(s, "p1").energy.en).toBe(Math.min(initial.maxEn, initial.en + amounts.normalHit + 5 + amounts.actionEnd));
    expect(u(s, "p1").energy.killRecovered).toBe(true);
    const once = s; expect(commitRobotBattleBatch(s, originalAction)).toBe(once);
    s = open(s, squad(s).id); const source = squad(s).unitIds[2]!;
    const targetEn = u(s, "p2").energy.en;
    s = fixtureCommit(s, [fixtureAttack(s, source, "p2", 1, "one"), fixtureAttack(s, source, "p2", 1, "two")]);
    expect(u(s, "p2").energy.en).toBe(targetEn + 3); expect(u(s, "p2").energy.damagedRecovered).toBe(true);
  });
  it("does not refund normal-hit EN for a cost-bearing normal weapon", () => {
    const s = open(), initial = u(s, "p1").energy, attack = fixtureAttack(s, "p1", squad(s).unitIds[0]!, 1);
    const after = commitRobotBattleBatch(s, { ...input(s), summary: "cost-bearing weapon", attacks: [attack], members: [{ unitId: "p1", action: { kind: "normal-attack", energyCost: 5 } }] });
    expect(u(after, "p1").energy.en).toBe(initial.en - 5 + getRobotEnergyRecoveryAmounts(initial.maxEn).actionEnd);
    expect(u(after, "p1").energy.normalHitRecovered).toBe(false);
  });
  it("fails closed on unresolved joint-kill EN attribution and accepts only an explicit contributing policy", () => {
    let s = coreFixture(), a = squad(s); s = open(hp(s, "p1", 2), a.id);
    const attacks = a.unitIds.map((id, i) => fixtureAttack(s, id, "p1", 1, "joint" + i)), before = JSON.stringify(s);
    expect(() => fixtureCommit(s, attacks)).toThrow(/attribution remains unresolved/);
    expect(() => fixtureCommit(s, attacks, "bad-policy", { chooseKillCredit: () => "p3" })).toThrow(/contributing/);
    const after = fixtureCommit(s, attacks, "explicit-fixture-policy", { chooseKillCredit: () => a.unitIds[0]! });
    expect(after.units.filter(v => v.energy.killRecovered).map(v => v.id)).toEqual([a.unitIds[0]]); expect(JSON.stringify(s)).toBe(before);
  });
});

describe("connected defeats, command support and rounds", () => {
  it("M02 ends on boss defeat with surviving guards and clears the boss's buffs", () => {
    let s = open(coreFixture(), "commander"); s = commitRobotBattleBossCommand(s, input(s));
    const guard = squad(s).unitIds[0]!; expect(getRobotBattleCommandBonus(s, guard, "p1")).toEqual({ melee: 10, ranged: 10, defense: 10 });
    s = open(hp(s, "commander", 1)); s = fixtureCommit(s, [fixtureAttack(s, "p1", "commander", 1)]);
    expect(getRobotBattleResult(s)).toEqual({ result: "won", reason: "commander-defeated" });
    expect(u(s, guard).hp).toBeGreaterThan(0); expect(u(s, "commander").boss!.effects).toEqual([]);
    expect(() => beginRobotBattleTurn(s, "commander")).toThrow();
  });
  it("uses one same-round allied death event, drops positions, and loses immediately on all three", () => {
    let s = coreFixture(); const a = squad(s); s = open(s, a.id);
    s = fixtureCommit(s, a.unitIds.map((id, i) => fixtureAttack(s, id, "p" + (i + 1), 10000, "wipe" + i)));
    expect(getRobotBattleResult(s)).toMatchObject({ result: "lost", reason: "same-round-controlled-wipe" });
    expect(s.allied.waiting.map(w => [w.defeatedRound, w.returnRound, w.defeatEvent])).toEqual([[1, 3, 1], [1, 3, 1], [1, 3, 1]]);
    expect(s.units.filter(v => v.kind === "controlled").every(v => v.hp === 0 && v.position === null)).toBe(true);
  });
  it("returns a fallen ally at R+2 with full HP / ceil30% EN, cleared status and preserved gear; enemies stay dead", () => {
    let s = coreFixture(); const a = squad(s), source = a.unitIds[0]!, enemy = a.unitIds[1]!;
    s = decodeRobotBattleCore({ ...s, units: s.units.map(v => v.id === "p1" ? { ...v, statuses: ["fixture-effect"] } : v) });
    const gear = u(s, "p1").parts; s = open(s, a.id); s = fixtureCommit(s, [fixtureAttack(s, source, "p1", 10000)]);
    s = open(s, "p2"); s = fixtureCommit(s, [fixtureAttack(s, "p2", enemy, 10000, "kill-enemy")]);
    s = fixtureNextRound(s); expect(u(s, "p1").hp).toBe(0); expect(s.allied.round).toBe(2);
    s = fixtureNextRound(s); expect(s.allied.round).toBe(3);
    expect(u(s, "p1")).toMatchObject({ hp: u(s, "p1").maxHp, parts: gear, statuses: [], energy: { en: Math.ceil(u(s, "p1").energy.maxEn * 0.3), turnOpen: false, action: null } });
    expect(u(s, enemy).hp).toBe(0); expect(s.allied.waiting).toEqual([]);
  });
  it("expires command buffs at the next boss turn and disallows consecutive commands", () => {
    let s = open(coreFixture(), "commander"); s = commitRobotBattleBossCommand(s, input(s));
    s = fixtureNextRound(s); s = open(s, "commander");
    expect(u(s, "commander").boss!.effects).toEqual([]);
    expect(() => commitRobotBattleBossCommand(s, input(s, "consecutive"))).toThrow(/consecutive/);
  });
  it("keeps SPD timing/ties and mixed squad speed unresolved instead of selecting a scheduler", () => {
    const original = coreFixture(); const s = { ...original, units: original.units.map(v => v.id === "p2" ? { ...v, stats: { ...v.stats, spd: u(original, "p1").stats.spd } } : v) }; expect(inspectRobotBattleInitiative(s).timingPolicy).toBe("unresolved");
    expect(inspectRobotBattleInitiative(s).unresolved).toContain("equal-speed-order-unadopted");
    const id = squad(s).unitIds[0]!; const mixed = { ...s, units: s.units.map(v => v.id === id ? { ...v, stats: { ...v.stats, spd: v.stats.spd + 1 } } : v) };
    expect(inspectRobotBattleInitiative(mixed).unresolved).toContain("mixed-squad-speed:" + squad(s).id);
    expect(s.turn.actorId).toBeNull();
  });
  it("M02 times out at R8 only after all living actors finish, never advances past R8", () => {
    let s = coreFixture(); while (s.allied.round < 8) s = fixtureNextRound(s);
    expect(() => advanceRobotBattleRound(s)).toThrow(/full round/);
    s = fixtureNextRound(s); expect(getRobotBattleResult(s)).toEqual({ result: "lost", reason: "round-limit" }); expect(s.allied.round).toBe(8);
  });
});

describe("connected M30 objectives and shared facility", () => {
  it("counts three simultaneous member attacks separately, but each two-cell facility entity once", () => {
    let s = coreFixture(30, "hard"); const a = squad(s); s = open(s, a.id);
    const attacks = a.unitIds.map((id, i) => fixtureAttack(s, id, "allied-final-relay", 7, "blast" + i));
    const original = s; s = fixtureCommit(s, attacks, "facility-batch");
    expect(s.objective.kind === "m30" && s.objective.state.facility.hp).toBe(660 - 21);
    expect(s.objective.kind === "m30" && s.objective.state.appliedAttackIds).toEqual(["blast0", "blast1", "blast2"]);
    expect(commitRobotBattleBatch(s, { ...input(original, "facility-batch"), summary: "replay", attacks, members: a.unitIds.map(unitId => ({ unitId, action: { kind: "normal-attack", energyCost: 0 } })) })).toBe(s);
  });
  it("resolves every member of a facility-destroying batch and immediately loses without auto recovery", () => {
    let s = coreFixture(30); const a = squad(s); s = open(s, a.id);
    s = fixtureCommit(s, a.unitIds.map((id, i) => fixtureAttack(s, id, "allied-final-relay", 10000, "fatal" + i)));
    expect(getRobotBattleResult(s)).toEqual({ result: "lost", reason: "facility-destroyed" });
    expect(s.latest!.damage).toHaveLength(3); expect(s.attackIds).toHaveLength(3);
    expect(s.objective.kind === "m30" && s.objective.state.facility.hp).toBe(0);
    expect(() => advanceRobotBattleRound(s, fixtureWave)).toThrow();
  });
  it("publishes simultaneous facility damage and three allied deaths as one complete batch", () => {
    let s = coreFixture(30); const a = squad(s); s = open(s, a.id);
    const attacks = a.unitIds.map((id, i) => {
      const hit = fixtureAttack(s, id, "p" + (i + 1), 10000, "complete" + i), facility = fixtureAttack(s, id, "allied-final-relay", 10000);
      return { ...hit, effectKind: "blast" as const, targets: [...hit.targets, ...facility.targets] };
    });
    s = fixtureCommit(s, attacks);
    expect(getRobotBattleResult(s).result).toBe("lost"); expect(s.latest!.damage).toHaveLength(6);
    expect(s.allied.waiting).toHaveLength(3); expect(s.allied.lastDefeatEvent).toBe(1);
    expect(s.objective.kind === "m30" && s.objective.state.facility.hp).toBe(0);
  });
  it("uses the turn-start HP threshold for the M30 ultimate, consumes an action and EN, and never repeats it", () => {
    let s = open(hp(coreFixture(30, "hard"), "enemy-supreme-commander", 275), "enemy-supreme-commander");
    const en = u(s, "enemy-supreme-commander").energy.en;
    s = commitRobotBattleBossCommand(s, input(s));
    expect(u(s, "enemy-supreme-commander")).toMatchObject({ boss: { ultimateUsed: true }, energy: { action: { kind: "other", energyCost: 60 }, en: en - 60 + getRobotEnergyRecoveryAmounts(465).actionEnd } });
    for (const actor of s.actors.filter(a => a.unitIds.length === 3)) expect(getRobotBattleCommandBonus(s, actor.unitIds[0]!, "p1")).toEqual({ melee: 22, ranged: 22, defense: 16 });
    expect(() => fixtureCommit(s, [fixtureAttack(s, "enemy-supreme-commander", "p1", 1)])).toThrow();
    s = fixtureNextRound(s); s = open(s, "enemy-supreme-commander");
    expect(() => commitRobotBattleBossCommand(s, input(s, "repeat-ultimate"))).toThrow(/once-per-battle/);
    let high = open(coreFixture(30), "enemy-supreme-commander"); high = hp(high, "enemy-supreme-commander", 1);
    expect(() => commitRobotBattleBossCommand(high, input(high))).toThrow(/turn-start-hp/);
  });
  it("allows legal movement then pickup, consumes the action, and rejects friendly AI data operations", () => {
    let s = open(coreFixture(30, "normal", undefined, { p1: "K4" }));
    s = moveRobotBattleUnit(s, { ...input(s, "to-data"), unitId: "p1", destination: robotCellToPosition("K3") });
    s = commitRobotBattleData(s, { ...input(s, "pickup"), kind: "pickup" });
    expect(u(s, "p1").carriedObjectiveId).toBe("command-archives"); expect(s.turn.actorId).toBeNull();
    expect(() => fixtureCommit(s, [fixtureAttack(s, "p1", "enemy-supreme-commander", 1)])).toThrow();
    const friend = open(coreFixture(30, "normal", undefined, { f1: "K3" }), "f1");
    expect(() => commitRobotBattleData(friend, { ...input(friend), kind: "pickup" })).toThrow(/controlled/);
    expect(getRobotBattleStructures(s)).toEqual([robotCellToPosition("J13"), robotCellToPosition("K13")]);
  });
  it("drops data at the defeated carrier, permits another controlled robot to recover it, and preserves the drop through resume", () => {
    let s = open(coreFixture(30, "normal", undefined, { p1: "K3", p2: "L3" }));
    s = commitRobotBattleData(s, { ...input(s), kind: "pickup" }); const a = squad(s); s = open(s, a.id);
    s = fixtureCommit(s, [fixtureAttack(s, a.unitIds[0]!, "p1", 10000)]); s = decodeRobotBattleCore(s);
    expect(s.objective.kind === "m30" && s.objective.state.data).toEqual({ cell: robotCellToPosition("K3"), carrierId: null, sent: false });
    s = open(s, "p2"); s = moveRobotBattleUnit(s, { ...input(s, "recover-move"), unitId: "p2", destination: robotCellToPosition("K3") });
    s = commitRobotBattleData(s, { ...input(s, "recover-data"), kind: "pickup" });
    expect(u(s, "p2").carriedObjectiveId).toBe("command-archives"); expect(u(s, "p1").carriedObjectiveId).toBeNull();
  });
  it("requires a trusted reinforcement resolver at R7/R12 and records full squads once, with no repeated spawning", () => {
    let s = coreFixture(30); while (s.allied.round < 6) s = fixtureNextRound(s);
    s = fixtureCloseRound(s); const before = JSON.stringify(s);
    expect(() => advanceRobotBattleRound(s)).toThrow(/resolver required/); expect(JSON.stringify(s)).toBe(before);
    s = advanceRobotBattleRound(s, fixtureWave); expect(s.allied.round).toBe(7);
    expect(s.objective.kind === "m30" && s.objective.state.spawnedWaveIds).toHaveLength(1); expect(s.units).toHaveLength(15);
    while (s.allied.round < 12) s = fixtureNextRound(s);
    expect(s.objective.kind === "m30" && s.objective.state.spawnedWaveIds).toHaveLength(2); expect(s.units).toHaveLength(18);
    s = fixtureNextRound(s); expect(s.units).toHaveLength(18); expect(new Set(s.units.map(v => v.id)).size).toBe(18);
  });
  for (const bossFirst of [true, false]) it(`waits for R16 AND with ${bossFirst ? "boss first" : "data first"}, and round-trips every checkpoint`, () => {
    let s = coreFixture(30, "normal", undefined, { p1: "K3" });
    const kill = () => { s = open(hp(s, "enemy-supreme-commander", 1), "p2"); s = fixtureCommit(s, [fixtureAttack(s, "p2", "enemy-supreme-commander", 1)]); };
    if (bossFirst) kill();
    s = open(s); s = commitRobotBattleData(s, { ...input(s, "pickup"), kind: "pickup" });
    s = fixtureNextRound(s);
    // Explicit pre-action checkpoint near the upload site, not a teleport command.
    s = decodeRobotBattleCore({ ...s, units: s.units.map(v => v.id === "p1" ? { ...v, position: robotCellToPosition("I14") } : v) });
    s = open(s); s = commitRobotBattleData(s, { ...input(s, "transmit"), kind: "transmit" });
    if (!bossFirst) kill();
    expect(getRobotBattleResult(s).result).toBe("ongoing");
    while (s.allied.round < 16) { s = fixtureNextRound(s); expect(decodeRobotBattleCore(s)).toEqual(s); expect(getRobotBattleResult(s).result).toBe("ongoing"); }
    s = fixtureNextRound(s); expect(getRobotBattleResult(s).result).toBe("won"); expect(s.allied.round).toBe(16);
  });
  for (const missing of ["both", "data", "boss"]) it(`loses at R16 with ${missing} missing`, () => {
    let s = coreFixture(30);
    if (missing === "data") { s = open(hp(s, "enemy-supreme-commander", 1)); s = fixtureCommit(s, [fixtureAttack(s, "p1", "enemy-supreme-commander", 1)]); }
    if (missing === "boss" && s.objective.kind === "m30") s = decodeRobotBattleCore({ ...s, objective: { kind: "m30", state: { ...s.objective.state, data: { cell: null, carrierId: null, sent: true } } } });
    while (s.allied.round < 16) s = fixtureNextRound(s);
    s = fixtureNextRound(s); expect(getRobotBattleResult(s)).toEqual({ result: "lost", reason: "round-limit" });
  });
});

describe("connected snapshot and AI configuration safety", () => {
  it("persists AI mode/orders without consuming actions, resources or changing the latest action", () => {
    const s = open(coreFixture()), prior = JSON.stringify(s.units);
    let after = configureRobotBattleAi(s, { kind: "mode", mode: "manual" });
    after = configureRobotBattleAi(after, { kind: "instruction", unitId: "f1", instruction: { tacticId: "escort-specific-ally", targetUnitId: "p1" } });
    expect(after.actionIds).toEqual(s.actionIds); expect(after.turn).toEqual(s.turn); expect(after.latest).toEqual(s.latest); expect(JSON.stringify(after.units)).toBe(prior);
    expect(decodeRobotBattleCore(after)).toEqual(after);
    expect(() => configureRobotBattleAi(s, { kind: "instruction", unitId: "p1", instruction: { tacticId: "free-action" } } as never)).toThrow();
  });
  it("rejects corrupted HP, energy, actor state, respawn/boss/mission/data state without modifying the source", () => {
    const s = open(coreFixture(30)), before = JSON.stringify(s);
    const variants = [
      { ...s, version: 9 }, { ...s, board: { ...s.board, walls: [] } },
      { ...s, units: s.units.map(v => v.id === "p1" ? { ...v, hp: -1 } : v) },
      { ...s, units: s.units.map(v => v.id === "p1" ? { ...v, energy: { ...v.energy, en: v.energy.maxEn + 1 } } : v) },
      { ...s, turn: { ...s.turn, actorId: "p2" } },
      { ...s, allied: { ...s.allied, waiting: [{ unitId: "p1", defeatedRound: 1, returnRound: 3, defeatEvent: 1 }] } },
      { ...s, objective: { ...s.objective, state: { ...(s.objective.kind === "m30" ? s.objective.state : {}), bossDefeated: true } } }
    ];
    for (const variant of variants) expect(() => decodeRobotBattleCore(variant)).toThrow();
    expect(JSON.stringify(s)).toBe(before);
  });
  it("rejects forged boss support, weapon, wave, facility and AI references on resume", () => {
    let s = open(hp(coreFixture(30, "hard"), "enemy-supreme-commander", 275), "enemy-supreme-commander");
    s = commitRobotBattleBossCommand(s, input(s)); const unit = u(s, "enemy-supreme-commander"), boss = unit.boss!, objective = s.objective;
    expect(objective.kind).toBe("m30"); if (objective.kind !== "m30") throw new Error("M30 fixture");
    const corruptions = [
      { ...s, units: s.units.map(v => v.id === unit.id ? { ...v, boss: { ...boss, effects: boss.effects.map(e => ({ ...e, bonuses: { ...e.bonuses, defense: 999 } })) } } : v) },
      { ...s, units: s.units.map(v => v.id === unit.id ? { ...v, parts: [] } : v) },
      { ...s, objective: { kind: "m30", state: { ...objective.state, spawnedWaveIds: ["unknown-wave"] } } },
      { ...s, objective: { kind: "m30", state: { ...objective.state, appliedAttackIds: ["unrecorded-hit"] } } },
      { ...s, objective: { kind: "m30", state: { ...objective.state, facility: { ...objective.state.facility, maxHp: 1 } } } },
      { ...s, ai: { ...s.ai, instructions: { ...s.ai.instructions, f1: { tacticId: "focus-attack", targetUnitId: "unknown" } } } }
    ];
    for (const bad of corruptions) expect(() => decodeRobotBattleCore(bad)).toThrow();
  });
});
