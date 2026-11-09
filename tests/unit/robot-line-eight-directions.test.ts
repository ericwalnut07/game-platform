import { describe, expect, it } from "vitest";
import { getRobotFormationOptions, commitRobotFormation } from "../../src/games/robot-tactics/formations";
import { beginRobotBattleTurn, decodeRobotBattleCore, getRobotBattleUnit, robotBattleTurnId, type RobotBattleCoreState } from "../../src/games/robot-tactics/battleState";
import { checkRobotLineOfSight } from "../../src/games/robot-tactics/lineOfSight";
import { weaponCoreFixture, weaponFixtureProgress } from "../robot-tactics/weaponCoreFixture";
import { robotFormalBattleAdapter } from "../../src/client/games/robot-tactics/FormalBattleAdapter";
import type { RobotPosition } from "../../src/games/robot-tactics/movement";

const boss = "enemy-supreme-commander";
const weaponId = "light-pistol";
const directions: readonly (readonly [number, number])[] = [
  [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1],
];

function scene(dx: number, dy: number, steps = 2): RobotBattleCoreState {
  const original = weaponCoreFixture({
    progress: weaponFixtureProgress([weaponId, "light-lance"]),
    targetIds: [boss], offsets: [{ x: 2, y: 0 }], openTurn: false,
  });
  const blocked = [
    ...original.board.walls,
    ...original.units.filter(u => !["p1", "p2", boss].includes(u.id) && u.hp > 0 && u.position).map(u => u.position!),
    ...(original.objective.kind === "m30" ? original.objective.state.facility.cells : []),
  ];
  const free = (c: RobotPosition): boolean => c.x >= 0 && c.y >= 0 && c.x < original.board.width &&
    c.y < original.board.height && !blocked.some(b => b.x === c.x && b.y === c.y);
  const available = Array.from({ length: original.board.height }, (_, y) =>
    Array.from({ length: original.board.width }, (_, x) => ({ x, y }))).flat();
  const source = available.find(p => {
    const supporter = { x: p.x - Math.sign(dx), y: p.y - Math.sign(dy) };
    const target = { x: p.x + dx * steps, y: p.y + dy * steps };
    return free(p) && free(supporter) && free(target) &&
      checkRobotLineOfSight({ board: original.board, origin: p, target }).clear;
  });
  if (!source) throw new Error("No open formation test cluster for " + dx + "," + dy);
  const supporter = { x: source.x - Math.sign(dx), y: source.y - Math.sign(dy) };
  const target = { x: source.x + dx * steps, y: source.y + dy * steps };
  const modified = decodeRobotBattleCore({
    ...original,
    units: original.units.map(u => u.id === "p1" ? { ...u, position: source } :
      u.id === "p2" ? { ...u, position: supporter } :
      u.id === boss ? { ...u, position: target } : u),
  });
  return beginRobotBattleTurn(modified, "p1");
}

const selection = { participantIds: ["p2"], targetIds: [boss] };
const identity = (s: RobotBattleCoreState) => ({ kind: "line" as const, weaponId,
  actionId: "line-eight-way", turnId: robotBattleTurnId(s), ...selection });

describe("eight-way straight line formation", () => {
  for (const [dx, dy] of directions) {
    it(`accepts straight direction (${dx}, ${dy}) and commits exactly one formation`, () => {
      const s = scene(dx, dy), raw = JSON.stringify(s);
      const options = getRobotFormationOptions(s, "line", weaponId);
      expect(options.disabledReason).toBeNull();
      expect(options.selections).toContainEqual(selection);
      const after = commitRobotFormation(s, identity(s));
      expect(after.latest?.summary).toContain("ライン連携");
      expect(after.latest?.damage.some(d => d.targetId === boss && (d.damage ?? 0) > 0)).toBe(true);
      expect(getRobotBattleUnit(after, "p1").energy.action).toEqual({ kind: "other", energyCost: options.energyCost });
      expect(getRobotBattleUnit(after, "p2").energy).toEqual(getRobotBattleUnit(s, "p2").energy);
      expect(after.spentFormations).toContain("line");
      expect(decodeRobotBattleCore(after)).toEqual(after);
      expect(commitRobotFormation(after, identity(s))).toBe(after);
      expect(JSON.stringify(s)).toBe(raw);
    });
  }
  it("publishes a diagonal line selection to the real battle screen adapter", () => {
    const s = scene(1, 1);
    const projected = robotFormalBattleAdapter.project({
      departure: { battleId: s.id } as never, snapshot: JSON.parse(JSON.stringify(s)), sequence: 0,
    } as never);
    expect(projected.choices.some(choice =>
      choice.commandId === "line:" + weaponId &&
      choice.selection.participantIds.includes("p2") &&
      choice.selection.targetIds.includes(boss)
    )).toBe(true);
  });
  it("rejects a skewed off-axis enemy, without spending EN or changing state", () => {
    const s = scene(2, 1, 1), before = JSON.stringify(s);
    expect(getRobotFormationOptions(s, "line", weaponId).selections).not.toContainEqual(selection);
    expect(() => commitRobotFormation(s, identity(s))).toThrow();
    expect(JSON.stringify(s)).toBe(before);
  });
  it("rejects a misaligned supporter even when the enemy is diagonally in range", () => {
    const s = scene(1, 1), source = getRobotBattleUnit(s, "p1").position!;
    const alternative = s.units.find(u => u.id !== "p1" && u.id !== "p2" && u.id !== boss && u.kind === "friendly-ai");
    if (!alternative) throw new Error("Expected friendly AI for negative fixture");
    const changed = decodeRobotBattleCore({ ...s, units: s.units.map(u => u.id === "p2" ?
      { ...u, position: { x: source.x - 1, y: source.y } } : u) });
    expect(getRobotFormationOptions(changed, "line", weaponId).selections).not.toContainEqual(selection);
    expect(() => commitRobotFormation(changed, identity(changed))).toThrow();
  });
});
