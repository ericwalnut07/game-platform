import { afterEach, describe, expect, it, vi } from "vitest";
import { ROBOT_AI_TACTICS } from "../../src/games/robot-tactics/aiInstructions";
import group from "../../docs/design/robot-tactics/current-group-combat.json";
import { createRobotOfflineSave } from "../../src/games/robot-tactics/offlineSession";
import { RobotBattleAutoDriver } from "../../src/client/games/robot-tactics/BattleAutoDriver";
import { focusRobotBattleCamera, robotBattleCameraBox, zoomRobotBattleCamera } from "../../src/client/games/robot-tactics/BattleCamera";
import { planRobotBattleEffects } from "../../src/client/games/robot-tactics/BattleEffects";
import { assertRobotBattleViewModel, compatibleRobotBattleChoices, emptyRobotBattleSelection, matchingRobotBattleChoice, robotBattleSelectionCells, type RobotBattleViewModel } from "../../src/client/games/robot-tactics/BattleViewModel";
import { createBattleFixtureRuntime, projectBattleFixture } from "../robot-tactics/battle-fixture/runtime";

function model(family = "slash", sweepMax = 2): RobotBattleViewModel {
  const runtime = createBattleFixtureRuntime(family, sweepMax), departure = { battleId: "ui-test", key: { missionNumber: 1, difficulty: "easy" as const }, party: createRobotOfflineSave().progress.party };
  return projectBattleFixture({ runtimeId: runtime.id, runtimeVersion: runtime.version, departure, snapshot: runtime.create(departure), sequence: 0, committedActionIds: [], latestSummary: "戦闘開始" });
}
const aiModel = (kind: "enemy" | "friendly-ai", mode: "auto" | "manual" = "auto") => { const m = model(); return { ...m, queue: m.queue.filter(a => a.kind === kind), commands: [], choices: [], ai: { ...m.ai, mode } }; };
afterEach(() => vi.useRealTimers());
describe("Core-projected selection", () => {
  it("does not commit by tapping and matches only complete supplied choices", () => {
    const m = model(), before = JSON.stringify(m), choices = m.choices.filter(c => c.commandId === "sweep");
    expect(matchingRobotBattleChoice(choices, emptyRobotBattleSelection())).toBeNull();
    const one = { ...emptyRobotBattleSelection(), targetIds: ["e1"] };
    expect(compatibleRobotBattleChoices(choices, one).every(c => c.selection.targetIds.includes("e1"))).toBe(true);
    expect(matchingRobotBattleChoice(choices, one)?.selection.targetIds).toEqual(["e1"]);
    expect(matchingRobotBattleChoice(choices, { ...one, targetIds: ["e1", "e2"] })).not.toBeNull();
    expect(matchingRobotBattleChoice(choices, { ...one, targetIds: ["e1", "e2", "e3"] })).toBeNull();
    expect(JSON.stringify(m)).toBe(before);
  });
  it("allows a three-target sweep only when that complete option is supplied", () => {
    const m = model("slash", 3);
    expect(matchingRobotBattleChoice(m.choices.filter(c => c.commandId === "sweep"), { ...emptyRobotBattleSelection(), targetIds: ["e3", "e1", "e2"] })).not.toBeNull();
  });
  it("shows only current command/role candidates, including friendly AI participants", () => {
    const m = model(), line = m.choices.filter(c => c.commandId === "line");
    expect(robotBattleSelectionCells(m, line, emptyRobotBattleSelection(), "participant")).toEqual([m.units.find(u => u.id === "f1")!.cell]);
    expect(matchingRobotBattleChoice(line, { ...emptyRobotBattleSelection(), targetIds: ["e2"] })).toBeNull();
    expect(matchingRobotBattleChoice(line, { ...emptyRobotBattleSelection(), participantIds: ["f1"], targetIds: ["e2"] })).not.toBeNull();
  });
  it("keeps common LOS/range block reasons distinct without adding a UI distance metric", () => {
    const m = model("assault");
    expect(m.blocked.find(b => b.cell.x === 9 && b.cell.y === 8)?.reason).toBe("壁により射線が遮られています");
    expect(m.blocked.find(b => b.cell.x === 6 && b.cell.y === 4)?.reason).toBe("射程外です");
  });
  it("projects both structure cells as one entity selection", () => {
    const m = model(), choice = { id: "facility", commandId: "normal", selection: { ...emptyRobotBattleSelection(), targetIds: ["relay"] }, payload: { fixture: "facility" } };
    expect(robotBattleSelectionCells(m, [choice], emptyRobotBattleSelection(), "target")).toEqual(m.structures[0]!.cells);
    expect(matchingRobotBattleChoice([choice], choice.selection)?.selection.targetIds).toEqual(["relay"]);
  });
  it("rejects ambiguous, invalid and future-AI action projections", () => {
    const m = model(); expect(() => assertRobotBattleViewModel(m)).not.toThrow();
    expect(() => assertRobotBattleViewModel({ ...m, queue: [...m.queue, m.queue[0]!] })).not.toThrow(); // The Core may peek into the next round.
    expect(() => assertRobotBattleViewModel({ ...m, choices: [...m.choices, { ...m.choices[0]!, id: "ambiguous" }] })).toThrow(/Ambiguous/);
    expect(() => assertRobotBattleViewModel({ ...aiModel("enemy"), choices: m.choices })).toThrow(/future AI/);
    expect(() => assertRobotBattleViewModel({ ...m, units: m.units.map(u => ({ ...u, en: -1 })) })).toThrow();
    expect(() => assertRobotBattleViewModel({ ...m, choices: [{ ...m.choices[0]!, selection: { ...emptyRobotBattleSelection(), participantIds: ["unknown"] } }] })).toThrow();
  });
});
describe("view camera and post-commit effects", () => {
  it("clamps focus and overview to the board with no state/action mutation", () => {
    const camera = { mode: "focus" as const, center: { x: 6, y: 8 }, span: 9 }, board = { width: 19, height: 17 };
    expect(robotBattleCameraBox(camera, board)).toEqual({ x: 2, y: 4, width: 9, height: 9 });
    expect(robotBattleCameraBox(focusRobotBattleCamera(camera, { x: 100, y: -1 }, board), board)).toEqual({ x: 10, y: 0, width: 9, height: 9 });
    expect(robotBattleCameraBox({ ...camera, mode: "overview" }, board)).toEqual({ x: 0, y: 0, width: 19, height: 17 });
    expect(zoomRobotBattleCamera(camera, .01).span).toBe(5); expect(zoomRobotBattleCamera(camera, 100).span).toBe(19);
    expect(camera.span).toBe(9); expect(() => zoomRobotBattleCamera(camera, NaN)).toThrow();
  });
  it("preserves individual damage and simultaneous targets in an 800ms visual batch", () => {
    const hits = [0, 1, 2].map(pulse => ({ cell: { x: 1, y: 2 }, kind: "assault" as const, damage: pulse + 7, pulse }));
    const planned = planRobotBattleEffects(hits);
    expect(planned.map(p => p.hit.damage)).toEqual([7, 8, 9]);
    expect(planned[0]!.delayMs).toBe(0); expect(planned.at(-1)!.delayMs + planned.at(-1)!.durationMs).toBe(800);
    const area = planRobotBattleEffects([{ ...hits[0]!, cell: { x: 2, y: 3 } }, hits[0]!]); expect(area.map(p => p.delayMs)).toEqual([0, 0]);
  });
  it("keeps non-damage effects distinct, handles empty effects and rejects fractional hits", () => {
    expect(planRobotBattleEffects([])).toEqual([]);
    expect(planRobotBattleEffects([{ cell: { x: 0, y: 0 }, kind: "special:defend", damage: null, pulse: 0 }])[0]!.hit.damage).toBeNull();
    expect(() => planRobotBattleEffects([{ cell: { x: 0, y: 0 }, kind: "slash", damage: .5, pulse: 0 }])).toThrow();
  });
  it("retains exactly the five adopted instruction IDs and labels", () => {
    expect(ROBOT_AI_TACTICS).toEqual(group.allies.tactics.map(t => ({ id: t.id, name: t.name })));
  });
});
describe("AI presentation scheduling", () => {
  const clock = { set: (cb: () => void, ms: number) => setTimeout(cb, ms), clear: (id: unknown) => clearTimeout(id as ReturnType<typeof setTimeout>) };
  it("never executes controlled turns and never asks for enemy confirmation", async () => {
    vi.useFakeTimers(); const execute = vi.fn(async () => {}), d = new RobotBattleAutoDriver(clock, execute, vi.fn());
    d.update(model(), false); await vi.advanceTimersByTimeAsync(1000); expect(execute).not.toHaveBeenCalled();
    d.update(aiModel("enemy", "manual"), false); await vi.advanceTimersByTimeAsync(799); expect(execute).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1); expect(execute).toHaveBeenCalledTimes(1); await vi.advanceTimersByTimeAsync(3000); expect(execute).toHaveBeenCalledTimes(1); d.dispose();
  });
  it("waits for each manual friendly instruction and uses the same executor", async () => {
    vi.useFakeTimers(); const execute = vi.fn(async () => {}), d = new RobotBattleAutoDriver(clock, execute, vi.fn()), m = aiModel("friendly-ai", "manual");
    d.update(m, false); await vi.advanceTimersByTimeAsync(2000); expect(execute).not.toHaveBeenCalled();
    d.approveFriendly(); d.update({ ...m, checkpoint: { ...m.checkpoint, sequence: 1 } }, false); await vi.advanceTimersByTimeAsync(800); expect(execute).toHaveBeenCalledTimes(1);
    d.update({ ...m, turnId: "next-friendly-turn", checkpoint: { ...m.checkpoint, sequence: 2 } }, false); await vi.advanceTimersByTimeAsync(1200); expect(execute).toHaveBeenCalledTimes(1); d.dispose();
  });
  it("pauses on options/background, respects saving and cancels stale callbacks", async () => {
    vi.useFakeTimers(); const execute = vi.fn(async () => {}), d = new RobotBattleAutoDriver(clock, execute, vi.fn()), m = aiModel("enemy");
    d.update(m, false); await vi.advanceTimersByTimeAsync(300); d.pause(true); await vi.advanceTimersByTimeAsync(1500); expect(execute).not.toHaveBeenCalled();
    d.pause(false); d.update(m, true); await vi.advanceTimersByTimeAsync(1000); expect(execute).not.toHaveBeenCalled();
    d.update(m, false); d.dispose(); await vi.advanceTimersByTimeAsync(1000); expect(execute).not.toHaveBeenCalled();
    const callbacks: (() => void)[] = [], stale = new RobotBattleAutoDriver({ set: cb => { callbacks.push(cb); return 1; }, clear: () => {} }, execute, vi.fn());
    stale.update(m, false); stale.pause(true); callbacks[0]!(); expect(execute).not.toHaveBeenCalled(); stale.dispose();
  });
  it("does not overlap pending commits and stops a failed auto action until retry", async () => {
    vi.useFakeTimers(); let resolve!: () => void;
    const execute = vi.fn(() => new Promise<void>(r => { resolve = r; })), onError = vi.fn(), d = new RobotBattleAutoDriver(clock, execute, onError), m = aiModel("enemy");
    d.update(m, false); await vi.advanceTimersByTimeAsync(800); d.update({ ...m, checkpoint: { ...m.checkpoint, sequence: 1 } }, false); await vi.advanceTimersByTimeAsync(2000); expect(execute).toHaveBeenCalledTimes(1);
    resolve(); await Promise.resolve(); await Promise.resolve(); d.dispose();
    const fail = vi.fn(async () => { throw new Error("disk-full"); }), f = new RobotBattleAutoDriver(clock, fail, onError);
    f.update(m, false); await vi.advanceTimersByTimeAsync(800); await vi.advanceTimersByTimeAsync(2000); expect(fail).toHaveBeenCalledTimes(1); expect(onError).toHaveBeenCalled();
    f.retry(); await vi.advanceTimersByTimeAsync(800); expect(fail).toHaveBeenCalledTimes(2); f.dispose();
  });
});
