import { describe, expect, expectTypeOf, it } from "vitest";
import { applyRobotAlliedDefeats, beginNextRobotAlliedRound, createRobotAlliedLifecycle, type RobotAlliedLifeUnit, type RobotAlliedSpawnContext } from "../../src/games/robot-tactics/alliedLifecycle";
import { getRobotStagePlan, requireApprovedRobotStage } from "../../src/games/robot-tactics/stageCatalog";
import { robotCellToPosition, robotPositionToCell, type RobotPosition } from "../../src/games/robot-tactics/movement";
import { getRobotFrameStatPlan } from "../../src/games/robot-tactics/growth";

const unit = (kind: RobotAlliedLifeUnit["kind"], number: 1 | 2 | 3) => ({
  id: (kind === "controlled" ? "p" : "f") + number, kind, number,
  hp: 60, maxHp: 98, en: 19, maxEn: 101,
  position: { x: number - 1, y: kind === "controlled" ? 0 : 1 },
  statuses: ["test-effect"], carriedObjectiveId: null as string | null,
  equipment: { frame: "defense-1", coreLevel: 11, parts: ["standard-armor"] },
  tactic: "defend-location"
});
const roster = () => [unit("controlled", 1), unit("controlled", 2), unit("controlled", 3), unit("friendly-ai", 1), unit("friendly-ai", 2), unit("friendly-ai", 3)];
const context = (): RobotAlliedSpawnContext => ({
  board: { width: 8, height: 6, walls: [] },
  spawnPriority: [0, 1, 2, 3].flatMap(x => [{ x, y: 4 }, { x, y: 5 }]),
  occupied: [], structures: []
});
const create = () => createRobotAlliedLifecycle(roster());

describe("allied defeat and same-round wipe", () => {
  it("records one simultaneous event and rejects duplicate/unknown/already defeated IDs atomically", () => {
    const initial = create(), before = JSON.stringify(initial);
    expect(() => applyRobotAlliedDefeats(initial, ["p1", "missing"])).toThrow();
    expect(() => applyRobotAlliedDefeats(initial, ["p1", "p1"])).toThrow();
    expect(() => applyRobotAlliedDefeats(initial, [])).toThrow();
    expect(JSON.stringify(initial)).toBe(before);
    const s = applyRobotAlliedDefeats(initial, ["f2", "p1"]).state;
    expectTypeOf(s.allies[0]!.position).toEqualTypeOf<RobotPosition | null>();
    expect(s.waiting.map(q => [q.defeatedRound, q.returnRound, q.defeatEvent])).toEqual([[1, 3, 1], [1, 3, 1]]);
    expect(s.allies.find(u => u.id === "p1")).toMatchObject({ hp: 0, position: null });
    expect(() => applyRobotAlliedDefeats(s, ["p1"])).toThrow();
    expect(initial.allies.find(u => u.id === "p1")?.hp).toBe(60);
  });
  it("loses immediately on the third distinct controlled defeat in one round", () => {
    let s = applyRobotAlliedDefeats(create(), ["p1", "p2"]).state;
    expect(s.lostBySameRoundWipe).toBe(false);
    s = applyRobotAlliedDefeats(s, ["p3", "f1"]).state;
    expect(s.lostBySameRoundWipe).toBe(true);
    expect(new Set(s.controlledDefeatedThisRound)).toEqual(new Set(["p1", "p2", "p3"]));
    expect(() => beginNextRobotAlliedRound(s, context())).toThrow(/Battle ended/);
    expect(() => applyRobotAlliedDefeats(s, ["f2"])).toThrow(/Battle ended/);
  });
  it("also detects a simultaneous three-controlled wipe, regardless of input order", () => {
    expect(applyRobotAlliedDefeats(create(), ["p3", "p1", "p2"]).state.lostBySameRoundWipe).toBe(true);
  });
  it("never substitutes friendly AI deaths for controlled deaths", () => {
    const s = applyRobotAlliedDefeats(create(), ["p1", "p2", "f1", "f2", "f3"]).state;
    expect(s.lostBySameRoundWipe).toBe(false);
    expect(s.controlledDefeatedThisRound).toEqual(["p1", "p2"]);
  });
  it("does not combine rounds or lose just because all three controlled robots are waiting", () => {
    let s = applyRobotAlliedDefeats(create(), ["p1", "p2"]).state;
    s = beginNextRobotAlliedRound(s, context()).state;
    expect(s.controlledDefeatedThisRound).toEqual([]);
    s = applyRobotAlliedDefeats(s, ["p3"]).state;
    expect(s.allies.filter(u => u.kind === "controlled").every(u => u.hp === 0)).toBe(true);
    expect(s.lostBySameRoundWipe).toBe(false);
    expect(s.controlledDefeatedThisRound).toEqual(["p3"]);
  });
  it("drops carried data at the death location once and returns without it", () => {
    const allies = roster(); allies[0]!.carriedObjectiveId = "mission-data";
    const original = createRobotAlliedLifecycle(allies);
    const dead = applyRobotAlliedDefeats(original, ["p1"]);
    expect(dead.droppedObjectives).toEqual([{ objectiveId: "mission-data", unitId: "p1", position: { x: 0, y: 0 } }]);
    expect(dead.state.allies[0]!.carriedObjectiveId).toBeNull();
    expect(original.allies[0]!.carriedObjectiveId).toBe("mission-data");
    const returned = beginNextRobotAlliedRound(beginNextRobotAlliedRound(dead.state, context()).state, context());
    expect(returned.state.allies[0]!.carriedObjectiveId).toBeNull();
  });
});

describe("round-start allied returns", () => {
  it("waits the complete intervening round and returns at R+2 with adopted HP/EN and cleared statuses", () => {
    const original = create();
    let s = applyRobotAlliedDefeats(original, ["p1"]).state;
    const r2 = beginNextRobotAlliedRound(s, context());
    expect(r2.state.round).toBe(2);
    expect(r2.respawnedUnitIds).toEqual([]);
    expect(r2.state.allies[0]!.hp).toBe(0);
    const r3 = beginNextRobotAlliedRound(r2.state, context());
    expect(r3.state.round).toBe(3);
    expect(r3.respawnedUnitIds).toEqual(["p1"]);
    expect(r3.state.allies[0]).toMatchObject({ hp: 98, en: 31, position: { x: 0, y: 4 }, statuses: [], carriedObjectiveId: null });
    expect(r3.state.allies[0]!.equipment).toEqual(original.allies[0]!.equipment);
    expect(r3.state.allies[0]!.tactic).toBe("defend-location");
    expect(r3.state.waiting).toEqual([]);
    expect(r3.state.allies[1]).toBe(r2.state.allies[1]);
  });
  it("orders exact ties by controlled first, then roster number, independent of roster/request order", () => {
    const initial = createRobotAlliedLifecycle(roster().reverse());
    const dead = applyRobotAlliedDefeats(initial, ["f3", "p2", "f1", "p1", "f2"]).state;
    const result = beginNextRobotAlliedRound(beginNextRobotAlliedRound(dead, context()).state, context());
    expect(result.respawnedUnitIds).toEqual(["p1", "p2", "f1", "f2", "f3"]);
    expect(result.respawnedUnitIds.map(id => result.state.allies.find(u => u.id === id)!.position)).toEqual(context().spawnPriority.slice(0, 5));
  });
  it("puts an earlier friendly AI death before a later controlled death", () => {
    let s = applyRobotAlliedDefeats(create(), ["f2"]).state;
    s = applyRobotAlliedDefeats(s, ["p1"]).state;
    const result = beginNextRobotAlliedRound(beginNextRobotAlliedRound(s, context()).state, context());
    expect(result.respawnedUnitIds).toEqual(["f2", "p1"]);
  });
  it("skips walls, structures, enemies and living allies, reserving each new placement immediately", () => {
    const allies = roster(); allies[5]!.position = { x: 1, y: 5 };
    const initial = createRobotAlliedLifecycle(allies);
    const dead = applyRobotAlliedDefeats(initial, ["p1", "f1"]).state;
    const c = context();
    const blocked = { ...c, board: { ...c.board, walls: [{ x: 0, y: 4 }] }, structures: [{ x: 0, y: 5 }], occupied: [{ x: 1, y: 4 }] };
    const before = JSON.stringify(blocked);
    const result = beginNextRobotAlliedRound(beginNextRobotAlliedRound(dead, blocked).state, blocked);
    expect(result.state.allies.find(u => u.id === "p1")!.position).toEqual({ x: 2, y: 4 });
    expect(result.state.allies.find(u => u.id === "f1")!.position).toEqual({ x: 2, y: 5 });
    expect(JSON.stringify(blocked)).toBe(before);
  });
  it("defers blocked returns repeatedly without changing the original defeat priority", () => {
    let s = applyRobotAlliedDefeats(create(), ["f1"]).state;
    s = applyRobotAlliedDefeats(s, ["p1"]).state;
    const c = context(), full = { ...c, occupied: c.spawnPriority };
    s = beginNextRobotAlliedRound(s, full).state;
    const deferred = beginNextRobotAlliedRound(s, full);
    expect(deferred.respawnedUnitIds).toEqual([]);
    expect(deferred.deferredUnitIds).toEqual(["f1", "p1"]);
    expect(deferred.state.waiting).toEqual(s.waiting);
    const later = beginNextRobotAlliedRound(deferred.state, full);
    expect(later.deferredUnitIds).toEqual(["f1", "p1"]);
    const oneFree = { ...c, occupied: c.spawnPriority.slice(1) };
    const first = beginNextRobotAlliedRound(later.state, oneFree);
    expect(first.respawnedUnitIds).toEqual(["f1"]);
    expect(first.deferredUnitIds).toEqual(["p1"]);
    const next = beginNextRobotAlliedRound(first.state, c);
    expect(next.respawnedUnitIds).toEqual(["p1"]);
    expect(next.state.allies.find(u => u.id === "p1")!.position).toEqual(c.spawnPriority[1]);
  });
  it("allows repeated defeat/return cycles instead of imposing a reuse cap", () => {
    let s = create();
    for (let cycle = 0; cycle < 3; cycle++) {
      s = applyRobotAlliedDefeats(s, ["p1"]).state;
      s = beginNextRobotAlliedRound(beginNextRobotAlliedRound(s, context()).state, context()).state;
      expect(s.allies[0]!.hp).toBe(98);
      expect(s.waiting).toEqual([]);
    }
    expect(s.round).toBe(7);
    expect(s.lastDefeatEvent).toBe(3);
    expect(s.lostBySameRoundWipe).toBe(false);
  });
});

describe("lifecycle projection validation", () => {
  it("rejects invalid roster identities, counts and vitals", () => {
    expect(() => createRobotAlliedLifecycle(roster().slice(1))).toThrow(/Three/);
    const duplicate = roster(); duplicate[1]!.id = "p1";
    expect(() => createRobotAlliedLifecycle(duplicate)).toThrow(/ID/);
    const badSlot = roster(); badSlot[1]!.number = 1;
    expect(() => createRobotAlliedLifecycle(badSlot)).toThrow(/roster/);
    for (const value of [-1, 0, 1.5, Infinity, NaN]) {
      const invalid = roster(); invalid[0]!.hp = value;
      expect(() => createRobotAlliedLifecycle(invalid)).toThrow();
    }
    const excessive = roster(); excessive[0]!.en = 102;
    expect(() => createRobotAlliedLifecycle(excessive)).toThrow(/maximum/);
    const sameCell = roster(); sameCell[1]!.position = sameCell[0]!.position;
    expect(() => createRobotAlliedLifecycle(sameCell)).toThrow(/same cell/);
    const carriers = roster(); carriers[0]!.carriedObjectiveId = "data"; carriers[1]!.carriedObjectiveId = "data";
    expect(() => createRobotAlliedLifecycle(carriers)).toThrow(/objective/);
  });
  it("rejects malformed spawn contexts without advancing or mutating the round", () => {
    const s = create(), c = context(), before = JSON.stringify(s);
    for (const spawnPriority of [[], [c.spawnPriority[0]!, c.spawnPriority[0]!], [{ x: 8, y: 0 }], [{ x: -1, y: 0 }], [{ x: 0.5, y: 0 }]]) {
      expect(() => beginNextRobotAlliedRound(s, { ...c, spawnPriority })).toThrow();
    }
    expect(JSON.stringify(s)).toBe(before);
  });
  it("copies initial mutable roster cells/statuses rather than aliasing them", () => {
    const input = roster(), s = createRobotAlliedLifecycle(input);
    input[0]!.position.x = 7; input[0]!.statuses.push("later");
    expect(s.allies[0]!.position).toEqual({ x: 0, y: 0 });
    expect(s.allies[0]!.statuses).toEqual(["test-effect"]);
  });
});

it("smokes adopted M01-M07 deployment priorities and new frame HP without approving a formal stage", () => {
  for (let missionNumber = 1; missionNumber <= 7; missionNumber++) {
    const key = { missionNumber, difficulty: "easy" as const }, plan = getRobotStagePlan(key);
    const units = roster().slice(0, 5).map((u, i) => ({ ...u, maxHp: getRobotFrameStatPlan("defense-1", 11).stats.hp!, position: robotCellToPosition(i < 3 ? plan.players[i]! : plan.friendlyAI[i - 3]!.cell) }));
    let s = applyRobotAlliedDefeats(createRobotAlliedLifecycle(units), ["p1"]).state;
    const c: RobotAlliedSpawnContext = { board: { ...plan.board, walls: plan.board.walls.map(robotCellToPosition) }, spawnPriority: plan.respawnPriority.map(robotCellToPosition), occupied: plan.initialEnemies.flatMap(e => e.cells).map(robotCellToPosition), structures: [] };
    // Target footprint adapters are pending; this is a respawn smoke, not a battle simulation.
    s = beginNextRobotAlliedRound(s, c).state;
    const returned = beginNextRobotAlliedRound(s, c);
    expect(returned.respawnedUnitIds).toEqual(["p1"]);
    expect(returned.state.allies[0]!.hp).toBe(98);
    const unavailable = new Set([...plan.players.slice(1), ...plan.friendlyAI.map(a => a.cell), ...plan.initialEnemies.flatMap(e => e.cells), ...plan.board.walls]);
    const expected = plan.respawnPriority.find(cell => !unavailable.has(cell));
    expect(robotPositionToCell(returned.state.allies[0]!.position!)).toBe(expected);
    expect(plan.isReadyForFormalPlay).toBe(false);
    expect(() => requireApprovedRobotStage(key)).toThrow();
  }
});
