import { getRobotM30GravityPenalty } from "../../src/games/robot-tactics/m30GiantAttacks";
import { commitRobotBattleBlast } from "../../src/games/robot-tactics/battleBlast";
import { commitRobotAdoptedAction } from "../../src/games/robot-tactics/adoptedEffects";
import { getRobotBattleDefense } from "../../src/games/robot-tactics/battleEffects";
import { commitRobotBattleNormalAttack, commitRobotBattleSpreadAttack, commitRobotExpansionSpecial } from "../../src/games/robot-tactics/battleWeaponActions";
import { commitRobotDelta } from "../../src/games/robot-tactics/commonCombat";
import { commitRobotNpcTurn } from "../../src/games/robot-tactics/battleNpc";
import { resolveRobotBasicPart } from "../../src/games/robot-tactics/equipment";
import { expect, it } from "vitest";
import { robotFormalBattleAdapter } from "../../src/client/games/robot-tactics/FormalBattleAdapter";
import { commitRobotBattlePassive, decodeRobotBattleCore, getRobotBattleActor, getRobotBattleLegalMoves, getRobotBattleMovementShape, getRobotBattleResult,
  getRobotBattleStructures, getRobotBattleUnit, moveRobotBattleUnit, robotBattleIsAlly, robotBattleTurnId,
  type RobotBattleCoreState } from "../../src/games/robot-tactics/battleState";
import { settleRobotBattleConsequences } from "../../src/games/robot-tactics/battleSettlement";
import { createRobotM30PhaseOne, robotBattleJson, robotFormalRuntime, scheduleRobotFormalBattle, validateRobotM30Battle } from "../../src/games/robot-tactics/formalRuntime";
import { getRobotBattleUnitTargetSlots, type RobotM30GiantState, ROBOT_M30_GIANT_ID, ROBOT_M30_GIANT_SECOND_ACTOR, getRobotM30GiantCells, isRobotM30GiantAnchor } from "../../src/games/robot-tactics/m30Giant";
import { robotCellToPosition, robotPositionToCell } from "../../src/games/robot-tactics/movement";
import { createRobotOfflineSave, RobotOfflineSession, type RobotOfflineDeparture, type RobotJson } from "../../src/games/robot-tactics/offlineSession";
import { offlineExpansionFixtureProgress } from "../robot-tactics/offlineExpansionFixture";

const departureFor = (expansionDifficulty?: "hardest" | "inferno"): RobotOfflineDeparture => ({
  battleId: "m30-giant-test", key: { missionNumber: 30, difficulty: "hard" }, party: createRobotOfflineSave().progress.party,
  ...(expansionDifficulty ? { expansionDifficulty } : {}),
});
function wait(s: RobotBattleCoreState) {
  return scheduleRobotFormalBattle(commitRobotBattlePassive(s, { kind: "wait", actionId: "wait:" + s.turn.serial, turnId: robotBattleTurnId(s) }));
}

function finalEnemy(departure: RobotOfflineDeparture) {
  let s = decodeRobotBattleCore(createRobotM30PhaseOne(departure));
  while (s.allied.round < 10 || getRobotBattleUnit(s, getRobotBattleActor(s).unitIds[0]!).kind !== "controlled") s = wait(s);
  const attacker = getRobotBattleUnit(s, getRobotBattleActor(s).unitIds[0]!);
  const survivor = s.units.find(u => u.kind === "light")!;
  const casualty = s.units.find(u => u.kind === "friendly-ai")!;
  const enemiesDefeated = s.units.map(u => {
    if (u.id === survivor.id) return { ...u, hp: 1, position: { x: attacker.position!.x, y: attacker.position!.y - 1 } };
    if (u.id === casualty.id || !robotBattleIsAlly(u)) return { ...u, hp: 0 };
    return { ...u, hp: u.maxHp - 10, energy: { ...u.energy, en: Math.min(u.energy.en, 20) } };
  });
  s = decodeRobotBattleCore(settleRobotBattleConsequences(s, enemiesDefeated));
  const move = { kind: "normal", weaponId: attacker.parts.find(p => resolveRobotBasicPart(p.partId, p.level).slot === "weapon")!.partId, targetId: survivor.id };
  return { s, move };
}

function land(departure: RobotOfflineDeparture) {
  const { s, move } = finalEnemy(departure);
  const resolution = robotFormalRuntime.act(robotBattleJson(s), move, departure);
  return { phase1: s, resolution, giantPhase: decodeRobotBattleCore(resolution.snapshot) };
}

it.each([["hardest", 5000, 65, 110, 55], ["inferno", 7000, 70, 130, 65]] as const)(
  "transitions from a real final hit to %s R1 and resets all five allies", (difficulty, hp, def, spd, secondSpd) => {
    const departure = departureFor(difficulty);
    const { phase1, resolution, giantPhase } = land(departure);
    const g = getRobotBattleUnit(giantPhase, ROBOT_M30_GIANT_ID);
    expect(resolution.outcome).toBeNull();
    expect(phase1.allied.waiting).toHaveLength(1);
    expect(giantPhase.allied).toMatchObject({ round: 1, waiting: [], lastDefeatEvent: 0 });
    expect(giantPhase.board.walls.map(robotPositionToCell)).toEqual(["F8", "N8"]);
    expect(giantPhase.units.filter(robotBattleIsAlly).map(u => robotPositionToCell(u.position!))).toEqual(["G16", "J16", "M16", "I15", "K15"]);
    for (const u of giantPhase.units.filter(robotBattleIsAlly)) {
      expect(u.hp).toBe(u.maxHp);
      expect(u.energy.en).toBe(u.energy.maxEn);
      expect(u.statuses).toEqual([]);
      expect(u.parts).toEqual(getRobotBattleUnit(phase1, u.id).parts);
    }
    expect(g).toMatchObject({ hp, maxHp: hp, stats: { def, spd, mov: 2 } });
    expect(getRobotM30GiantCells(g.position!).map(robotPositionToCell)).toEqual(["J7", "K7", "J8", "K8"]);
    expect(getRobotBattleStructures(giantPhase).map(robotPositionToCell)).toEqual(["K7", "J8", "K8"]);
    expect(giantPhase.initiative!.entries.filter(e => e.actorId.startsWith(ROBOT_M30_GIANT_ID)).map(e => e.spd)).toEqual([spd, secondSpd]);
    expect(giantPhase.latest?.damage).toEqual([]);
    expect(giantPhase.latest?.summary).toContain("着地");
    validateRobotM30Battle(resolution.snapshot, departure);
    const view = robotFormalBattleAdapter.project({ departure, runtimeId: robotFormalRuntime.id, runtimeVersion: 1, snapshot: resolution.snapshot, committedActionIds: [], sequence: 0, latestSummary: "" });
    expect(view.hideRoundLimit).toBe(true);
    expect(view.objectiveMarkers).toHaveLength(4);
    expect(view.visualCues?.filter(cue => cue.effect === "destroy_large")).toHaveLength(7);
    expect(view.objectiveText).toBe("M30 第2段階：巨大ボスを撃破");
  });

it("keeps Hard on the completed first phase without a giant", () => {
  const { resolution, giantPhase } = land(departureFor());
  expect(giantPhase.objective.kind).toBe("m30-elimination");
  expect(resolution.outcome).toMatchObject({ result: "won", endedRound: 10 });
});

it("resolves both initiative slots independently, with the same footprint and HP on resume", () => {
  const departure = departureFor("hardest");
  let state = land(departure).giantPhase;
  while (state.turn.actorId !== ROBOT_M30_GIANT_ID) state = wait(state);
  const moves = getRobotBattleLegalMoves(state, ROBOT_M30_GIANT_ID);
  expect(moves.length).toBeGreaterThan(0);
  expect(moves.every(m => m.path.length <= 2 && m.path.every(p => isRobotM30GiantAnchor(p)))).toBe(true);
  const destination = moves[0]!.destination;
  state = moveRobotBattleUnit(state, { actionId: "giant-move", turnId: robotBattleTurnId(state), unitId: ROBOT_M30_GIANT_ID, destination });
  validateRobotM30Battle(robotBattleJson(state), departure);
  while (state.turn.actorId !== ROBOT_M30_GIANT_SECOND_ACTOR) state = wait(state);
  expect(getRobotBattleUnit(state, ROBOT_M30_GIANT_ID)).toMatchObject({ position: destination, energy: { ownTurn: 2, moved: false } });
  validateRobotM30Battle(robotBattleJson(state), departure);
  expect(() => validateRobotM30Battle(robotBattleJson({ ...state,
    units: state.units.map(u => u.id === ROBOT_M30_GIANT_ID ? { ...u, position: robotCellToPosition("F7") } : u),
  }), departure)).toThrow(/checkpoint|blocked/);
});

it("keeps the giant phase checkpoint and awards no clear on landing", async () => {
  const progress = offlineExpansionFixtureProgress();
  const initial = { ...createRobotOfflineSave(), progress };
  let raw: string | null = JSON.stringify(initial);
  const storage = { async read() { return raw; }, async replace(expected: string | null, next: string) {
    if (raw !== expected) throw new Error("stale save");
    raw = next;
  } };
  const runtime = { ...robotFormalRuntime,
    create: (departure: RobotOfflineDeparture) => robotBattleJson(finalEnemy(departure).s) };
  const session = new RobotOfflineSession(storage, runtime, () => "save-giant");
  await session.load();
  await session.start({ missionNumber: 30, difficulty: "hard" }, "hardest");
  const battle = session.state.battle!;
  const command = { battleId: battle.departure.battleId, expectedSequence: battle.sequence, actionId: "last-hit", action: finalEnemy(battle.departure).move as RobotJson };
  await session.act(command);
  expect(session.state.result).toBeNull();
  expect(session.state.progress).toEqual(progress);
  const reloaded = new RobotOfflineSession(storage, runtime, () => "unused");
  await reloaded.load();
  expect(reloaded.state).toEqual(session.state);
  expect(decodeRobotBattleCore(reloaded.state.battle!.snapshot).objective.kind).toBe("m30-giant");
  await reloaded.act(command);
  expect(reloaded.state.battle!.sequence).toBe(1);

  // Use the real completion action and session after preparing an R1 snapshot
  // with the boss at 1 HP, so this test does not depend on unfinished boss AI.
  let ready = decodeRobotBattleCore(reloaded.state.battle!.snapshot);
  while (getRobotBattleUnit(ready, getRobotBattleActor(ready).unitIds[0]!).kind !== "controlled") ready = wait(ready);
  const attacker = getRobotBattleUnit(ready, getRobotBattleActor(ready).unitIds[0]!);
  const weaponId = attacker.parts.find(p => resolveRobotBasicPart(p.partId, p.level).slot === "weapon")!.partId;
  ready = { ...ready, units: ready.units.map(u => u.id === ROBOT_M30_GIANT_ID ? { ...u, hp: 1 } :
    u.id === attacker.id ? { ...u, position: robotCellToPosition("I7") } : u) };
  const prepared = reloaded.state;
  raw = JSON.stringify({ ...prepared, battle: { ...prepared.battle, snapshot: robotBattleJson(ready) } });
  const completing = new RobotOfflineSession(storage, runtime, () => "unused");
  await completing.load();
  const finish = { ...command, expectedSequence: 1, actionId: "giant-finish",
    action: { kind: "normal", weaponId, targetId: ROBOT_M30_GIANT_ID } };
  await completing.act(finish);
  expect(completing.state.result).toMatchObject({ result: "won", equipmentUnlocked: ["full-core-release-unit"] });
  expect(completing.state.progress.expansionCleared).toEqual(["hardest-30"]);
  await completing.act(finish);
  expect(completing.state.progress.expansionCleared).toEqual(["hardest-30"]);
});

it("allows a kill on R12 and otherwise ends at R13 before opening a turn", () => {
  const departure = departureFor("inferno");
  let state = land(departure).giantPhase;
  while (state.allied.round < 12) state = wait(state);
  const defeated = settleRobotBattleConsequences(state, state.units.map(u => u.id === ROBOT_M30_GIANT_ID ? { ...u, hp: 0 } : u));
  expect(getRobotBattleResult(defeated)).toEqual({ result: "won", reason: "giant-defeated" });
  while (getRobotBattleResult(state).result === "ongoing") state = wait(state);
  expect(state.allied.round).toBe(13);
  expect(state.turn.actorId).toBeNull();
  expect(getRobotBattleResult(state)).toEqual({ result: "lost", reason: "final-annihilation-cannon" });
  expect(state.latest?.summary).toContain("最終殲滅砲");
  validateRobotM30Battle(robotBattleJson(state), departure);
});

function aimedAtGiant() {
  const departure = departureFor("hardest");
  let s = land(departure).giantPhase;
  while (getRobotBattleUnit(s, getRobotBattleActor(s).unitIds[0]!).kind !== "controlled") s = wait(s);
  const acting = getRobotBattleActor(s).unitIds[0]!;
  const supporters = s.units.filter(u => robotBattleIsAlly(u) && u.id !== acting).slice(0, 2).map(u => u.id);
  const coords = ["I7", "H7", "H8"].map(robotCellToPosition);
  s = { ...s, units: s.units.map(u => {
    const offset = [acting, ...supporters].indexOf(u.id);
    if (offset < 0) return u;
    return u.id !== acting ? { ...u, position: coords[offset]! } : {
      ...u, position: coords[0]!, energy: { ...u.energy, en: 100, maxEn: 100 },
      parts: [{ partId: "light-pistol", level: 1 }, { partId: "sniper-rifle", level: 1 }],
    };
  }) };
  return { departure, s, supporters };
}

it("uses the selected cell for normal shots, then aggregates four spread hits into shared HP", () => {
  const { departure, s } = aimedAtGiant();
  const slots = getRobotBattleUnitTargetSlots(s, getRobotBattleUnit(s, ROBOT_M30_GIANT_ID));
  const before = getRobotBattleUnit(s, ROBOT_M30_GIANT_ID).hp;
  const turn = robotBattleTurnId(s);
  const normal = commitRobotBattleNormalAttack(s, { actionId: "shot", turnId: turn, weaponId: "light-pistol", targetId: slots[3]!.id });
  expect(normal.latest!.damage).toMatchObject([{ targetId: ROBOT_M30_GIANT_ID, cells: [slots[3]!.cell] }]);
  expect(getRobotBattleUnit(normal, ROBOT_M30_GIANT_ID).hp).toBe(before - normal.latest!.damage[0]!.damage!);

  const spread = commitRobotBattleSpreadAttack(s, { actionId: "spread", turnId: turn,
    primaryWeaponId: "light-pistol", secondaryWeaponId: "sniper-rifle", centerId: slots[2]!.id });
  const hits = spread.latest!.damage;
  expect(hits).toHaveLength(4);
  expect(new Set(hits.map(h => robotPositionToCell(h.cells[0]!)))).toEqual(new Set(["J7", "K7", "J8", "K8"]));
  expect(hits.every(hit => hit.targetId === ROBOT_M30_GIANT_ID && hit.damage === hits[0]!.damage)).toBe(true);
  expect(getRobotBattleUnit(spread, ROBOT_M30_GIANT_ID).hp).toBe(before - hits.reduce((sum, hit) => sum + hit.damage!, 0));
  const view = robotFormalBattleAdapter.project({ departure, runtimeId: robotFormalRuntime.id, runtimeVersion: 1,
    snapshot: robotBattleJson(s), sequence: 0, committedActionIds: [], latestSummary: "" });
  expect(view.targetSlots).toHaveLength(4);
  expect(view.choices.filter(c => c.commandId === "combo")).toHaveLength(4);
  expect(view.choices.find(c => c.commandId === "normal:light-pistol" && c.selection.targetIds.includes(slots[3]!.id))).toBeDefined();
});

it("resolves three distinct Delta cells in one action and rejects a duplicate cell", () => {
  const { s, supporters } = aimedAtGiant();
  const slots = getRobotBattleUnitTargetSlots(s, getRobotBattleUnit(s, ROBOT_M30_GIANT_ID));
  const request = { actionId: "delta-cells", turnId: robotBattleTurnId(s), weaponId: "light-pistol", participantIds: supporters,
    targetIds: slots.slice(0, 3).map(slot => slot.id) };
  expect(() => commitRobotDelta(s, { ...request, targetIds: [slots[0]!.id, slots[0]!.id] })).toThrow(/distinct/);
  const after = commitRobotDelta(s, request), hits = after.latest!.damage;
  expect(hits.map(h => h.cells[0])).toEqual(slots.slice(0, 3).map(slot => slot.cell));
  expect(getRobotBattleUnit(after, ROBOT_M30_GIANT_ID).hp).toBe(5000 - hits.reduce((total, h) => total + h.damage!, 0));
});

it("commits both giant warnings, restores them from a save and fires at the fixed cells in round order", () => {
  const departure = departureFor("hardest");
  let s = land(departure).giantPhase;
  if (s.objective.kind !== "m30-giant") throw new Error("Expected giant phase");
  s = { ...s, objective: { kind: "m30-giant", state: { ...s.objective.state,
    attacks: { lastUsed: { gravity: 1, shockwave: 1, sweep: 1 }, warnings: [], fires: [] },
  } } };
  let warnings: NonNullable<RobotM30GiantState["attacks"]>["warnings"] = [];
  for (let turns = 0; s.allied.round === 1 && turns < 8; turns++) {
    const actor = getRobotBattleUnit(s, getRobotBattleActor(s).unitIds[0]!);
    if (actor.id === ROBOT_M30_GIANT_ID) {
      const acted = commitRobotNpcTurn(s, { actionId: "giant:" + s.turn.actorId, turnId: robotBattleTurnId(s) });
      if (acted.objective.kind !== "m30-giant") throw new Error("Expected giant phase");
      warnings = acted.objective.state.attacks!.warnings;
      validateRobotM30Battle(robotBattleJson(acted), departure);
      s = scheduleRobotFormalBattle(acted);
    } else s = wait(s);
  }
  expect(warnings.map(w => w.kind).sort()).toEqual(["bombardment", "laser"]);
  expect(warnings.every(w => w.round === 2)).toBe(true);
  expect(s.allied.round).toBe(2);
  validateRobotM30Battle(robotBattleJson(s), departure);
  const hits = s.latest!.damage;
  expect(hits.some(hit => hit.effectKind === "special:giant-laser")).toBe(true);
  expect(hits.some(hit => hit.effectKind === "special:giant-bombardment")).toBe(true);
  const order = ["special:giant-laser", "special:giant-bombardment", "special:giant-fire"];
  expect(hits.map(h => order.indexOf(h.effectKind))).toEqual(hits.map(h => order.indexOf(h.effectKind)).sort((a, b) => a - b));
});

it("preserves blast center and neighbor roles and shares weakpoint DEF across the footprint", () => {
  const { s } = aimedAtGiant();
  const acting = getRobotBattleActor(s).unitIds[0]!;
  const loaded = { ...s, units: s.units.map(u => u.id === acting ? { ...u,
    parts: [{ partId: "light-grenade-launcher", level: 1 }, u.parts[1]!],
    addons: [{ partId: "weakpoint-targeting" }],
  } : u) };
  const slots = getRobotBattleUnitTargetSlots(loaded, getRobotBattleUnit(loaded, ROBOT_M30_GIANT_ID));
  const turnId = robotBattleTurnId(loaded);
  const marked = commitRobotAdoptedAction(loaded,
    { actionId: "aim", turnId, kind: "weakpoint-targeting", targetId: slots[3]!.id });
  const giant = getRobotBattleUnit(marked, ROBOT_M30_GIANT_ID);
  expect(getRobotBattleDefense(marked, giant)).toBe(48);
  expect(giant.weakpoint?.amount).toBe(17);
  expect(marked.latest?.supportCues?.[0]?.cell).toEqual(slots[3]!.cell);

  const blasted = commitRobotBattleBlast(loaded, { actionId: "blast-cells", turnId, weaponId: "light-grenade-launcher",
    mode: "burst", locations: [{ cell: slots[3]!.cell, neighborIds: [slots[1]!.id] }] });
  const hits = blasted.latest!.damage;
  expect(hits.map(h => h.cells[0])).toEqual([slots[3]!.cell, slots[1]!.cell]);
  expect(hits[0]!.damage).toBeGreaterThan(hits[1]!.damage!);
  expect(getRobotBattleUnit(blasted, ROBOT_M30_GIANT_ID).hp).toBe(5000 - hits.reduce((sum, h) => sum + h.damage!, 0));
});

function giantWithAttack(kind: "gravity" | "shockwave" | "release" | "sweep", difficulty: "hardest" | "inferno" = "hardest") {
  const departure = departureFor(difficulty);
  let state = land(departure).giantPhase;
  while (state.turn.actorId !== ROBOT_M30_GIANT_ID) state = wait(state);
  const victim = state.units.find(u => u.kind === "controlled")!;
  if (state.objective.kind !== "m30-giant") throw new Error("Expected giant phase");
  const blocked = ["laser", "bombardment", "gravity", "shockwave", "release", "sweep"].filter(k => k !== kind);
  // Give competing techniques a cooldown from the current round.
  const lastUsed = Object.fromEntries(blocked.filter(k => k !== "release").map(k => [k, 1]));
  // Release must stay legal in other tests because a same-round release locks
  // out every special. Keep the chosen targets outside its range where needed.
  const cells = kind === "sweep" ? ["D8", "D9", "E9", "F10", "C9"] :
    kind === "gravity" ? ["C5", "D5", "E5", "C6", "D6"] : ["H8"];
  const ids = [victim.id, ...state.units.filter(u => u.id !== victim.id && robotBattleIsAlly(u)).map(u => u.id)];
  const units = state.units.map(u => {
    const cell = cells[ids.indexOf(u.id)];
    return cell ? { ...u, position: robotCellToPosition(cell) } : u;
  });
  // An equal-count shockwave takes precedence over release.
  const attacks = { lastUsed: lastUsed, warnings: [], fires: [] };
  state = { ...state, units, objective: { kind: "m30-giant", state: { ...state.objective.state, attacks } } };
  return { departure, state, victimId: victim.id };
}
const giantCommand = (state: RobotBattleCoreState, id: string) =>
  commitRobotNpcTurn(state, { actionId: id, turnId: robotBattleTurnId(state) });

it("applies gravity immediately, can reduce ordinary movement to zero, and expires after the third Inferno round", () => {
  const { state, victimId, departure } = giantWithAttack("gravity", "inferno");
  let next = giantCommand(state, "gravity");
  expect(next.latest?.summary).toContain("重力拘束");
  expect(next.latest?.damage).toEqual([]);
  expect(getRobotM30GravityPenalty(next, victimId)).toBe(3);
  expect(getRobotBattleMovementShape(getRobotBattleUnit(next, victimId), next)?.mov).toBe(0);
  validateRobotM30Battle(robotBattleJson(next), departure);
  next = scheduleRobotFormalBattle(next);
  while (next.allied.round < 3) next = wait(next);
  expect(getRobotM30GravityPenalty(next, victimId)).toBe(3);
  while (next.allied.round < 4) next = wait(next);
  expect(getRobotM30GravityPenalty(next, victimId)).toBe(0);
  validateRobotM30Battle(robotBattleJson(next), departure);
});

it("pushes from the nearest giant cell and applies distinct shockwave and collision damage", () => {
  const { state, victimId, departure } = giantWithAttack("shockwave");
  const next = giantCommand(state, "shock");
  expect(next.latest?.summary).toContain("巨体衝撃波");
  expect(next.latest?.damage.map(hit => hit.effectKind)).toEqual(["special:giant-shockwave", "special:collision"]);
  expect(next.latest?.damage[1]?.damage).toBe(30);
  expect(next.latest?.damage[1]?.targetId).toBe(victimId);
  expect(robotPositionToCell(next.latest!.damage[1]!.cells[0]!)).toBe("G8");
  validateRobotM30Battle(robotBattleJson(next), departure);
});

it("waits after release in the same round and can use another special the next round", () => {
  const { state, departure } = giantWithAttack("release");
  let next = giantCommand(state, "release");
  expect(next.latest?.damage[0]).toMatchObject({ damage: 120, effectKind: "special:giant-release" });
  expect(getRobotBattleDefense(next, getRobotBattleUnit(next, ROBOT_M30_GIANT_ID))).toBe(45);
  next = scheduleRobotFormalBattle(next);
  while (next.turn.actorId !== ROBOT_M30_GIANT_SECOND_ACTOR) next = wait(next);
  if (next.objective.kind !== "m30-giant") throw new Error("Expected giant phase");
  const attacks = next.objective.state.attacks!;
  const { gravity: _available, ...lastUsed } = attacks.lastUsed;
  next = { ...next, objective: { kind: "m30-giant", state: { ...next.objective.state, attacks: { ...attacks, lastUsed } } } };
  next = giantCommand(next, "locked-slot");
  expect(next.latest?.summary).toContain("待機");
  validateRobotM30Battle(robotBattleJson(next), departure);
  next = scheduleRobotFormalBattle(next);
  while (next.allied.round < 2) next = wait(next);
  expect(getRobotBattleDefense(next, getRobotBattleUnit(next, ROBOT_M30_GIANT_ID))).toBe(45);
  while (getRobotBattleActor(next).unitIds[0] !== ROBOT_M30_GIANT_ID) next = wait(next);
  next = giantCommand(next, "next-round-special");
  expect(next.latest?.summary).toContain("重力拘束");
  expect(getRobotBattleUnit(next, ROBOT_M30_GIANT_ID).energy.en).toBe(0);
  if (next.objective.kind !== "m30-giant") throw new Error("Expected giant phase");
  expect(next.objective.state.attacks?.lastUsed).toMatchObject({ release: 1, gravity: 2 });
  robotFormalRuntime.validate(robotBattleJson(next), departure);
  next = scheduleRobotFormalBattle(next);
  while (next.allied.round < 3) next = wait(next);
  expect(getRobotBattleDefense(next, getRobotBattleUnit(next, ROBOT_M30_GIANT_ID))).toBe(65);
});

it("keeps a fixed sweep direction, advances two cells per round and resolves three passes", () => {
  const { state, departure } = giantWithAttack("sweep");
  let next = giantCommand(state, "sweep");
  expect(next.latest?.summary).toContain("地表掃射");
  const sweep = (s: RobotBattleCoreState) => s.objective.kind === "m30-giant" ? s.objective.state.attacks?.sweeps?.[0] : undefined;
  const start = sweep(next)!;
  expect(start).toMatchObject({ round: 2, remaining: 3 });
  validateRobotM30Battle(robotBattleJson(next), departure);
  next = scheduleRobotFormalBattle(next);
  for (let round = 2; round <= 4; round++) {
    while (next.allied.round < round) next = wait(next);
    expect(next.latest?.summary).toContain("地表掃射");
    const moved = sweep(next);
    if (round === 4) expect(moved).toBeUndefined();
    else expect(moved).toMatchObject({
      round: round + 1, remaining: 4 - round,
      direction: start.direction, axis: start.axis,
      region: { [start.axis === "x" ? "left" : "top"]: start.region[start.axis === "x" ? "left" : "top"] + 2 * (round - 1) * start.direction },
    });
    validateRobotM30Battle(robotBattleJson(next), departure);
  }
});

it.each(["cluster-cannon", "meteor-buster"] as const)("uses the selected boss cells for %s and keeps its two-neighbor cap", weaponId => {
  const { s } = aimedAtGiant();
  const actor = getRobotBattleActor(s).unitIds[0]!;
  const state = { ...s, units: s.units.map(u => u.id === actor ? { ...u,
    position: robotCellToPosition("G7"), parts: [{ partId: weaponId, level: 1 }, u.parts[1]!],
  } : u) };
  const slots = getRobotBattleUnitTargetSlots(state, getRobotBattleUnit(state, ROBOT_M30_GIANT_ID));
  const params = { actionId: "special:area", turnId: robotBattleTurnId(state), weaponId };
  expect(() => commitRobotExpansionSpecial(state, { ...params, targetIds: slots.map(p => p.id) })).toThrow();
  const result = commitRobotExpansionSpecial(state, { ...params, targetIds: slots.slice(0, 3).map(p => p.id) });
  expect(result.latest?.damage.map(hit => hit.cells[0])).toEqual(slots.slice(0, 3).map(p => p.cell));
  expect(result.latest?.damage.every(hit => hit.targetId === ROBOT_M30_GIANT_ID)).toBe(true);
});


it.each(["hardest", "inferno"] as const)("runs the %s boss AI with saved rounds through a terminal outcome", difficulty => {
  const departure = departureFor(difficulty);
  let s = land(departure).giantPhase;
  let actions = 0;
  while (getRobotBattleResult(s).result === "ongoing" && actions < 100) {
    const actor = getRobotBattleUnit(s, getRobotBattleActor(s).unitIds[0]!);
    if (actor.id === ROBOT_M30_GIANT_ID) {
      s = scheduleRobotFormalBattle(giantCommand(s, "smoke:" + actions));
      validateRobotM30Battle(robotBattleJson(s), departure);
      if (getRobotBattleResult(s).result === "ongoing") robotFormalBattleAdapter.project({
        departure, runtimeId: robotFormalRuntime.id, runtimeVersion: 1,
        snapshot: robotBattleJson(s), sequence: actions, committedActionIds: [], latestSummary: "",
      });
    } else s = wait(s);
    actions++;
  }
  expect(getRobotBattleResult(s).result).toBe("lost");
  expect(actions).toBeLessThan(100);
});
