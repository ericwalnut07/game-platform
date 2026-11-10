import { commitRobotBattleWeaponCombo } from "../../src/games/robot-tactics/battleWeaponActions";
import { commitRobotFormation } from "../../src/games/robot-tactics/formations";
import { commitRobotDelayedFuse } from "../../src/games/robot-tactics/delayedFuse";
import { reconcileRobotEarlyMission, recordRobotEarlyEntry } from "../../src/games/robot-tactics/earlyMissions";
import { addRobotHazard } from "../../src/games/robot-tactics/hazards";
import { expect, it } from "vitest";
import { advanceRobotBattleRound, beginRobotBattleTurn, decodeRobotBattleCore, getRobotBattleFacilities,
  getRobotBattleLegalMoves, getRobotBattlePendingActors, getRobotBattleResult, getRobotBattleUnit,
  moveRobotBattleUnit, robotBattleTurnId, type RobotBattleCoreState } from "../../src/games/robot-tactics/battleState";
import { commitRobotBattleBatch } from "../../src/games/robot-tactics/battleBatch";
import { applyRobotBurning } from "../../src/games/robot-tactics/burning";
import { robotEarlyGoalCells } from "../../src/games/robot-tactics/earlyMissions";
import { getRobotFacilityGuards, resolveRobotFacilityDamage } from "../../src/games/robot-tactics/facilityDefense";
import { robotCellToPosition, type RobotPosition } from "../../src/games/robot-tactics/movement";
import { createRobotOfflineProgress } from "../../src/games/robot-tactics/offlineProgress";
import { createRobotFormalBattleState, createRobotFormalReinforcement } from "../../src/games/robot-tactics/stageDeployment";
import { getRobotStagePlan } from "../../src/games/robot-tactics/stageCatalog";
import { robotFacilitySpriteForStructure, robotMissionArtUrl } from "../../src/client/games/robot-tactics/BattleFacilityArt";
import { resolveRobotTargetDamage } from "../../src/games/robot-tactics/attackResolution";
import type { RobotDifficulty } from "../../src/games/robot-tactics/types";

const difficulties = ["easy", "normal", "hard"] as const;
function scene(missionNumber: number, difficulty: RobotDifficulty = "easy") {
  return createRobotFormalBattleState({ battleId: `test-${missionNumber}`, key: { missionNumber, difficulty }, party: createRobotOfflineProgress().party });
}
function at(s: RobotBattleCoreState, id: string, position: RobotPosition): RobotBattleCoreState {
  return { ...s, units: s.units.map(u => u.id === id ? { ...u, position } : u) };
}
function arm(s: RobotBattleCoreState, id: string, weapons: readonly string[], addon?: string): RobotBattleCoreState {
  return { ...s, units: s.units.map(u => u.id === id ? { ...u,
    energy: { ...u.energy, en: u.energy.maxEn },
    parts: weapons.map(partId => ({ partId, level: 1 })), ...(addon ? { addons: [{ partId: addon }] } : {}),
  } : u) };
}
function testTurn(s: RobotBattleCoreState, id: string) {
  const { initiative: _initiative, ...base } = s;
  return beginRobotBattleTurn(base, id);
}

it.each([4, 11, 18, 23, 25, 29])("M%02i resolves canonical original defenders and all shield levels on every difficulty", mission => {
  for (const difficulty of difficulties) {
    const s = scene(mission, difficulty), [left, right] = getRobotBattleFacilities(s);
    expect(left).toBeDefined();
    expect(right).toBeDefined();
    const guards = getRobotFacilityGuards(s, left!.id);
    expect(guards).toHaveLength(3);
    const stage = getRobotStagePlan(s.key);
    for (const depot of [left!, right!]) {
      const [member] = getRobotFacilityGuards(s, depot.id);
      expect(stage.initialEnemies.some(e => e.id === member?.squadId && e.cells.length === 3)).toBe(true);
      expect(stage.reinforcements.some(w => w.squad.id === member?.squadId)).toBe(false);
    }
    expect(getRobotFacilityGuards(s, right!.id)).toHaveLength(3);
    for (const [dead, expected] of [30, 40, 50, 60].entries()) {
      const ids = new Set(guards.slice(0, dead).map(u => u.id));
      const weakened = { ...s, units: s.units.map(u => ids.has(u.id) ? { ...u, hp: 0 } : u) };
      expect(resolveRobotFacilityDamage(weakened, left!.id, 60)).toBe(expected);
      expect(resolveRobotFacilityDamage(weakened, right!.id, 60)).toBe(30);
    }
    expect(resolveRobotFacilityDamage(s, left!.id, 1)).toBe(1);
    expect(resolveRobotFacilityDamage(s, left!.id, 0)).toBe(0);
  }
});

it("settles a consolidated footprint hit once and keeps its final shielded damage in the receipt", () => {
  const s = testTurn(scene(4), "core-a");
  const depot = getRobotBattleFacilities(s)[0]!;
  const resolution = resolveRobotTargetDamage({ attackLegal: true, spatial: { canReach: true, reason: "clear", sight: null },
    effect: { kind: "damaging", resolveAfterModifiers: () => 17 } });
  const after = commitRobotBattleBatch(s, { actionId: "hit", turnId: robotBattleTurnId(s), summary: "施設",
    members: [{ unitId: "core-a", action: { kind: "other", energyCost: 0 } }],
    attacks: [{ id: "packet", sourceId: "core-a", effectKind: "blast",
      targets: [{ entityId: depot.id, cells: depot.cells, resolution }] }],
  });
  expect(getRobotBattleFacilities(after)[0]!.hp).toBe(depot.hp - 8);
  expect(after.latest?.damage).toMatchObject([{ damage: 8, targetId: depot.id }]);
});

it("ticks saved facility burns exactly once per completed round", () => {
  let s = scene(4);
  const source = getRobotBattleUnit(s, "core-a"), depot = getRobotBattleFacilities(s)[0]!;
  const burning = applyRobotBurning(null, source.id, source.coreLevel!, 0);
  s = { ...s, facilityBurns: { [depot.id]: burning }, turn: { ...s.turn, actedActorIds: s.actors.map(a => a.id) },
    units: s.units.map(u => ({ ...u, energy: { ...u.energy, ownTurn: 1, action: { kind: "other", energyCost: 0 } } })) };
  const next = advanceRobotBattleRound(decodeRobotBattleCore(s), w => createRobotFormalReinforcement(getRobotStagePlan(s.key), w));
  expect(getRobotBattleFacilities(next)[0]!.hp).toBe(depot.hp - 2);
  expect(next.facilityBurns?.[depot.id]?.ticksRemaining).toBe(burning.ticksRemaining - 1);
  expect(decodeRobotBattleCore(next)).toEqual(next);
});

it.each([3, 10, 17, 25])("M%02i extracts on a legal endpoint, preserves HP, and removes initiative", mission => {
  let s = scene(mission);
  const goal = robotEarlyGoalCells(s.key)[0]!;
  for (const id of ["core-a", "core-b"]) {
    const near = { x: goal.x, y: goal.y + 1 };
    s = testTurn(at(s, id, near), id);
    expect(getRobotBattleLegalMoves(s, id).some(m => m.destination.x === goal.x && m.destination.y === goal.y)).toBe(true);
    const hp = getRobotBattleUnit(s, id).hp;
    s = moveRobotBattleUnit(s, { actionId: "escape-" + id, turnId: robotBattleTurnId(s), unitId: id, destination: goal });
    expect(getRobotBattleUnit(s, id)).toMatchObject({ hp, position: null, energy: { turnOpen: false } });
    expect(getRobotBattlePendingActors(s).some(a => a.unitIds.includes(id))).toBe(false);
    expect(s.allied.waiting.some(w => w.unitId === id)).toBe(false);
    expect(decodeRobotBattleCore(s)).toEqual(s);
  }
  expect(getRobotBattleResult(s).result).toBe(mission === 25 ? "ongoing" : "won");
  if (mission === 25 && s.objective.kind === "early") {
    const m = s.objective.state;
    const depotsDestroyed = { ...s, objective: { kind: "early" as const, state: { ...m, objects: {
      ...m.objects, objects: m.objects.objects.map(o => ({ ...o, hp: 0 })),
    } } } };
    expect(getRobotBattleResult(reconcileRobotEarlyMission(depotsDestroyed)).reason).toBe("depots-and-breakthrough-complete");
  }
});

it("migrates a legacy open turn after arrival and retains its build and defeat ledger", () => {
  const s = scene(10), goal = robotEarlyGoalCells(s.key)[0]!;
  const active = testTurn(at(s, "core-a", goal), "core-a");
  const legacy = recordRobotEarlyEntry(active, "core-a", goal);
  const restored = decodeRobotBattleCore(JSON.parse(JSON.stringify(legacy)));
  expect(restored.turn.actorId).toBeNull();
  expect(restored.turn.actedActorIds).toContain("core-a");
  expect(restored.allied).toEqual(active.allied);
  expect(getRobotBattleUnit(restored, "core-a")).toMatchObject({
    position: null, hp: getRobotBattleUnit(active, "core-a").hp, parts: getRobotBattleUnit(active, "core-a").parts,
  });
  expect(decodeRobotBattleCore(restored)).toEqual(restored);
});

it("connects each deployed object in M15–M30 to an existing sprite on all difficulties", () => {
  for (const difficulty of difficulties) for (let mission = 15; mission <= 30; mission++) {
    for (const o of getRobotBattleFacilities(scene(mission, difficulty))) {
      const sprite = robotFacilitySpriteForStructure(o.id, mission, o.hp);
      expect(sprite, `M${mission} ${o.id}`).toBeTruthy();
      if (sprite === "depot") {
        expect(robotFacilitySpriteForStructure(o.id, mission, 0)).toBe("depot-wreck");
        expect(robotMissionArtUrl("depot-wreck")).toMatch(/^data:image\/webp/);
      }
    }
  }
});

it("checks the unadopted M01 proposal H10 to H11 against the existing board for every difficulty", () => {
  for (const difficulty of difficulties) {
    const s = scene(1, difficulty), origin = robotCellToPosition("H10"), proposal = robotCellToPosition("H11");
    const unit = s.units.find(u => u.kind === "controlled" && u.position?.x === origin.x && u.position.y === origin.y);
    expect(unit).toBeDefined();
    const candidate = at(s, unit!.id, proposal);
    expect(() => decodeRobotBattleCore(candidate)).not.toThrow();
    const exits = (battle: RobotBattleCoreState) => battle.units.filter(u => u.kind === "controlled").map(u => getRobotBattleLegalMoves(battle, u.id).length);
    expect(exits(s)).toEqual([1, 5, 13]);
    expect(exits(candidate)).toEqual([5, 6, 9]);
    expect(getRobotBattleUnit(s, unit!.id).position).toEqual(origin);
  }
});


it.each([
  ["light-blade", "standard-sword", "D4"], ["light-blade", "heavy-hammer", "D4"],
  ["light-lance", "assault-rifle", "D6"], ["heavy-hammer", "assault-rifle", "D6"],
  ["assault-rifle", "howitzer", "D6"],
])("commits %s / %s on a depot", (primary, secondary, position) => {
  const s = testTurn(arm(at(scene(4), "core-a", robotCellToPosition(position)), "core-a", [primary, secondary]), "core-a");
  const depot = getRobotBattleFacilities(s)[0]!;
  const after = commitRobotBattleWeaponCombo(s, { actionId: "combo", turnId: robotBattleTurnId(s),
    primaryWeaponId: primary, secondaryWeaponId: secondary, targetIds: [depot.id],
  });
  const hits = after.latest!.damage.filter(e => e.targetId === depot.id);
  expect(hits.length).toBeGreaterThan(0);
  expect(new Set(hits.map(h => h.attackId)).size).toBe(hits.length);
  expect(getRobotBattleFacilities(after)[0]!.hp).toBe(Math.max(0, depot.hp - hits.reduce((total, hit) => total + hit.damage!, 0)));
});

it("uses separate depot and mobile targets for slash/ranged", () => {
  let s = at(scene(4), "core-a", robotCellToPosition("D4"));
  s = at(s, "left-defenders:1", robotCellToPosition("D6"));
  s = testTurn(arm(s, "core-a", ["light-blade", "assault-rifle"]), "core-a");
  const after = commitRobotBattleWeaponCombo(s, { actionId: "combo", turnId: robotBattleTurnId(s),
    primaryWeaponId: "light-blade", secondaryWeaponId: "assault-rifle", targetIds: ["depot-left", "left-defenders:1"],
  });
  expect(after.latest!.damage.map(e => e.targetId)).toEqual(["depot-left", "left-defenders:1"]);
});

it.each(["line", "delta", "pincer"] as const)("commits %s formation on a legal depot footprint", kind => {
  let s = at(scene(4), "left-defenders:1", robotCellToPosition("B7"));
  s = at(s, "core-a", robotCellToPosition(kind === "pincer" ? "C3" : "D4"));
  s = at(s, "core-b", robotCellToPosition(kind === "pincer" ? "E3" : "D5"));
  // The opposite guard for a pincer must be beyond the two-cell footprint.
  if (kind === "pincer") {
    s = at(s, "core-a", robotCellToPosition("D4"));
    s = at(s, "core-b", robotCellToPosition("D2"));
  }
  if (kind === "delta") s = at(s, "core-c", robotCellToPosition("C4"));
  s = arm(s, "core-a", ["light-blade", "assault-rifle"], kind === "pincer" ? "formation-extension-unlock" : undefined);
  if (kind === "delta") s = { ...s, units: s.units.map(u => u.id === "core-a" ? { ...u, energy: { ...u.energy, en: 75, maxEn: 75 } } : u) };
  s = testTurn(s, "core-a");
  const next = commitRobotFormation(s, { kind, actionId: "formation", turnId: robotBattleTurnId(s), weaponId: "light-blade",
    participantIds: kind === "delta" ? ["core-b", "core-c"] : ["core-b"], targetIds: ["depot-left"] });
  expect(next.latest!.damage.filter(h => h.targetId === "depot-left")).toHaveLength(1);
});

it("combines two overlapping fire zones and a saved burn with independent shielding", () => {
  let s = arm(scene(4), "core-a", ["howitzer", "light-lance"], "persistent-blast-fire");
  const depot = getRobotBattleFacilities(s)[0]!;
  s = addRobotHazard(addRobotHazard(s, "persistent-blast-fire", "core-a", depot.cells[0]!, "fire-a"), "persistent-blast-fire", "core-a", depot.cells[1]!, "fire-b");
  s = { ...s, facilityBurns: { [depot.id]: applyRobotBurning(null, "core-a", getRobotBattleUnit(s, "core-a").coreLevel!, 0) },
    turn: { ...s.turn, actedActorIds: s.actors.map(a => a.id) },
    units: s.units.map(u => ({ ...u, energy: { ...u.energy, ownTurn: 1, action: { kind: "other", energyCost: 0 } } })) };
  const next = advanceRobotBattleRound(decodeRobotBattleCore(s));
  expect(next.latest!.damage.map(e => [e.effectKind, e.damage])).toEqual([["special:dot", 2], ["special:blast-fire", 5]]);
  expect(getRobotBattleFacilities(next)[0]!.hp).toBe(depot.hp - 7);
});

it("attaches a delayed fuse to a depot and restores its round-end timing from the checkpoint", () => {
  let s = testTurn(arm(at(scene(4), "core-a", robotCellToPosition("D6")), "core-a", ["howitzer", "light-lance"], "delayed-fuse"), "core-a");
  s = commitRobotDelayedFuse(s, { actionId: "attach", turnId: robotBattleTurnId(s), weaponId: "howitzer", targetId: "depot-left" });
  expect(s.fuses!.bombs[0]).toMatchObject({ dueRound: 1, targetId: "depot-left", state: "armed" });
  s = { ...s, turn: { ...s.turn, actedActorIds: s.actors.map(a => a.id) },
    units: s.units.map(u => ({ ...u, energy: { ...u.energy, ownTurn: 1, action: { kind: "other", energyCost: 0 } } })) };
  const next = advanceRobotBattleRound(decodeRobotBattleCore(s));
  expect(next.latest!.damage.filter(e => e.targetId === "depot-left")).toHaveLength(1);
  expect(next.fuses!.bombs[0]!.state).toBe("detonated");
});
